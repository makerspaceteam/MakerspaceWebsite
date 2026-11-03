import bcrypt from "bcrypt";
import { safeHttpUrl } from "../../shared/safeUrl.js";
import { supabaseAdmin, assertSupabaseConfigured } from "../../config/supabaseClient.js";
import { uniqueUserNameFromEmail } from "../../shared/userAccounts.js";
import { adjustCredits, CreditsError } from "../../shared/credits.js";

const SALT_ROUNDS = 10;
const STAFF_ROLES = ["admin", "staff"];

// Everything the frontend course shape needs in one query: instructor name
// via the FK to users, lessons nested, and the enrollment count (the
// "students" number is derived, never stored).
const COURSE_SELECT = `
  *,
  instructor:users(user_id, full_name),
  lessons(*),
  course_enrollments(count),
  course_ratings(stars)
`;

// ---------------------------------------------------------------------------
// Mappers: the API speaks the frontend's camelCase course shape (the one
// data/courses.js established), so no page or component needs to change
// how it reads a course.

function toFrontendLesson(row) {
  return {
    id: row.lesson_id,
    title: row.title,
    duration: row.duration || "",
    type: row.lesson_type || "video",
    body: row.body || "",
    stepsBody: row.steps_body || "",
    interactiveBody: row.interactive_body || "",
    points: row.points || [],
  };
}

function toFrontendCourse(row) {
  const lessons = [...(row.lessons || [])]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(toFrontendLesson);
  // Real student ratings win; the stored rating column is only the seeded
  // fallback shown until the first rating arrives.
  const stars = (row.course_ratings || []).map((r) => r.stars);
  const avgRating = stars.length
    ? Math.round((stars.reduce((sum, s) => sum + s, 0) / stars.length) * 10) / 10
    : row.rating != null
      ? Number(row.rating)
      : 0;
  return {
    id: row.course_id,
    title: row.title,
    subtitle: row.subtitle || "",
    category: row.category || "",
    coverColor: row.cover_color || undefined,
    spineColor: row.spine_color || undefined,
    level: row.level || "Beginner",
    duration: row.duration || "",
    students: row.course_enrollments?.[0]?.count ?? 0,
    rating: avgRating,
    ratingCount: stars.length,
    aiAgentUrl: row.ai_agent_url || "",
    paths: row.paths?.length ? row.paths : ["basic"],
    interactivePrice: row.interactive_price != null ? Number(row.interactive_price) : undefined,
    description: row.description || "",
    instructor: row.instructor?.full_name || "",
    instructorId: row.instructor?.user_id ?? row.instructor_id ?? null,
    tags: row.tags || [],
    lessons,
  };
}

function toCourseRow(payload) {
  return {
    title: payload.title,
    subtitle: payload.subtitle || null,
    description: payload.description || null,
    category: payload.category || null,
    level: payload.level || "Beginner",
    duration: payload.duration || null,
    cover_color: payload.coverColor || null,
    spine_color: payload.spineColor || null,
    paths: Array.isArray(payload.paths) && payload.paths.length ? payload.paths : ["basic"],
    interactive_price: Number.isFinite(Number(payload.interactivePrice)) && Number(payload.interactivePrice) >= 0 ? Number(payload.interactivePrice) : null,
    ai_agent_url: safeHttpUrl(payload.aiAgentUrl) ?? null,
    tags: Array.isArray(payload.tags) ? payload.tags : [],
    instructor_id: payload.instructorId || null,
  };
}

function toLessonRows(courseId, lessons) {
  return (Array.isArray(lessons) ? lessons : []).map((l, i) => ({
    course_id: courseId,
    sort_order: i,
    title: l.title || "Untitled lesson",
    duration: l.duration || null,
    lesson_type: l.type || "video",
    body: l.body || null,
    steps_body: l.stepsBody || null,
    interactive_body: l.interactiveBody || null,
    points: Array.isArray(l.points) ? l.points : [],
  }));
}

async function fetchCourse(courseId) {
  const { data, error } = await supabaseAdmin
    .from("courses")
    .select(COURSE_SELECT)
    .eq("course_id", courseId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Lecturers may only touch their own courses; admin/staff may touch any.
function canEditCourse(user, courseRow) {
  if (STAFF_ROLES.includes(user.role)) return true;
  return user.role === "lecturer" && courseRow.instructor_id === user.user_id;
}

// ---------------------------------------------------------------------------
// Courses

// Catalog reads go through the service-role client (like every other module
// here): the learning tables have RLS enabled with no anon policies, so the
// anon-key client sees zero rows. The API is the trust boundary; these two
// endpoints only ever return the public course shape.
export async function listCourses(req, res, next) {
  if (!assertSupabaseConfigured(res)) return;
  try {
    const { data, error } = await supabaseAdmin
      .from("courses")
      .select(COURSE_SELECT)
      .order("course_id");
    if (error) throw error;
    res.json({ data: data.map(toFrontendCourse) });
  } catch (err) {
    next(err);
  }
}

export async function getCourse(req, res, next) {
  if (!assertSupabaseConfigured(res)) return;
  try {
    const { data, error } = await supabaseAdmin
      .from("courses")
      .select(COURSE_SELECT)
      .eq("course_id", req.params.id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: "Course not found" });
    res.json({ data: toFrontendCourse(data) });
  } catch (err) {
    next(err);
  }
}

export async function createCourse(req, res, next) {
  try {
    if (!req.body?.title?.trim()) {
      return res.status(400).json({ error: "title is required" });
    }
    const row = toCourseRow(req.body);
    // A lecturer always creates courses under their own name, no matter
    // what instructorId the client sent.
    if (req.user.role === "lecturer") row.instructor_id = req.user.user_id;

    const { data: created, error } = await supabaseAdmin
      .from("courses")
      .insert(row)
      .select("course_id")
      .single();
    if (error) throw error;

    const lessonRows = toLessonRows(created.course_id, req.body.lessons);
    if (lessonRows.length) {
      const { error: lessonError } = await supabaseAdmin.from("lessons").insert(lessonRows);
      if (lessonError) throw lessonError;
    }

    res.status(201).json({ data: toFrontendCourse(await fetchCourse(created.course_id)) });
  } catch (err) {
    next(err);
  }
}

export async function updateCourse(req, res, next) {
  try {
    const courseId = req.params.id;
    const { data: existing, error: findError } = await supabaseAdmin
      .from("courses")
      .select("course_id, instructor_id")
      .eq("course_id", courseId)
      .maybeSingle();
    if (findError) throw findError;
    if (!existing) return res.status(404).json({ error: "Course not found" });
    if (!canEditCourse(req.user, existing)) {
      return res.status(403).json({ error: "You can only edit your own courses" });
    }

    const row = toCourseRow(req.body);
    if (req.user.role === "lecturer") row.instructor_id = req.user.user_id;
    row.updated_at = new Date().toISOString();

    const { error: updateError } = await supabaseAdmin
      .from("courses")
      .update(row)
      .eq("course_id", courseId);
    if (updateError) throw updateError;

    // The editor always submits the full lesson list, so replacing them
    // wholesale is simpler than diffing.
    if (Array.isArray(req.body.lessons)) {
      const { error: clearError } = await supabaseAdmin
        .from("lessons")
        .delete()
        .eq("course_id", courseId);
      if (clearError) throw clearError;
      const lessonRows = toLessonRows(Number(courseId), req.body.lessons);
      if (lessonRows.length) {
        const { error: lessonError } = await supabaseAdmin.from("lessons").insert(lessonRows);
        if (lessonError) throw lessonError;
      }
    }

    res.json({ data: toFrontendCourse(await fetchCourse(courseId)) });
  } catch (err) {
    next(err);
  }
}

export async function deleteCourse(req, res, next) {
  try {
    const { data: existing, error: findError } = await supabaseAdmin
      .from("courses")
      .select("course_id, instructor_id")
      .eq("course_id", req.params.id)
      .maybeSingle();
    if (findError) throw findError;
    if (!existing) return res.status(404).json({ error: "Course not found" });
    if (!canEditCourse(req.user, existing)) {
      return res.status(403).json({ error: "You can only delete your own courses" });
    }

    const { error } = await supabaseAdmin.from("courses").delete().eq("course_id", req.params.id);
    if (error) throw error;
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Lecturers: thin admin API over users with role 'lecturer', shaped the way
// the AdminLecturers page and course editor expect ({ id, name, email, active }).

function toFrontendLecturer(row) {
  return {
    id: row.user_id,
    name: row.full_name,
    email: row.email,
    active: row.status === "active",
  };
}

export async function listLecturers(req, res, next) {
  try {
    const { data, error } = await supabaseAdmin
      .from("users")
      .select("user_id, full_name, email, status")
      .eq("role", "lecturer")
      .order("user_id");
    if (error) throw error;
    res.json({ data: data.map(toFrontendLecturer) });
  } catch (err) {
    next(err);
  }
}

export async function createLecturer(req, res, next) {
  try {
    const { name, email, password } = req.body || {};
    if (!name || !email || !password) {
      return res.status(400).json({ error: "name, email, and password are required" });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }

    const { data: existing, error: lookupError } = await supabaseAdmin
      .from("users")
      .select("user_id")
      .eq("email", email)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (existing) return res.status(409).json({ error: "An account with this email already exists" });

    const user_name = await uniqueUserNameFromEmail(email);
    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

    const { data: user, error } = await supabaseAdmin
      .from("users")
      .insert({ full_name: name, email, user_name, password_hash, role: "lecturer" })
      .select("user_id, full_name, email, status")
      .single();
    if (error) throw error;

    res.status(201).json({ data: toFrontendLecturer(user) });
  } catch (err) {
    next(err);
  }
}

export async function setLecturerStatus(req, res, next) {
  try {
    const { active } = req.body || {};
    if (typeof active !== "boolean") {
      return res.status(400).json({ error: "active (boolean) is required" });
    }
    const { data: user, error } = await supabaseAdmin
      .from("users")
      .update({ status: active ? "active" : "inactive", updated_at: new Date().toISOString() })
      .eq("user_id", req.params.id)
      .eq("role", "lecturer")
      .select("user_id, full_name, email, status")
      .maybeSingle();
    if (error) throw error;
    if (!user) return res.status(404).json({ error: "Lecturer not found" });
    res.json({ data: toFrontendLecturer(user) });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Enrollment + path unlocks (the mock "purchase")

export async function enrollInCourse(req, res, next) {
  try {
    const courseId = Number(req.params.id);
    const { error } = await supabaseAdmin
      .from("course_enrollments")
      .upsert(
        { course_id: courseId, user_id: req.user.user_id },
        { onConflict: "course_id,user_id", ignoreDuplicates: true }
      );
    if (error) throw error;
    res.status(201).json({ data: { courseId } });
  } catch (err) {
    next(err);
  }
}

export async function unlockCoursePath(req, res, next) {
  try {
    const courseId = Number(req.params.id);
    const { data: course, error: findError } = await supabaseAdmin
      .from("courses")
      .select("course_id, title, paths, interactive_price")
      .eq("course_id", courseId)
      .maybeSingle();
    if (findError) throw findError;
    if (!course) return res.status(404).json({ error: "Course not found" });
    if (!course.paths?.includes("interactive")) {
      return res.status(400).json({ error: "This course has no interactive path" });
    }

    const { data: alreadyUnlocked, error: unlockLookupError } = await supabaseAdmin
      .from("course_unlocks")
      .select("unlock_id")
      .eq("course_id", courseId)
      .eq("user_id", req.user.user_id)
      .eq("path", "interactive")
      .maybeSingle();
    if (unlockLookupError) throw unlockLookupError;

    const cost = course.interactive_price || 0;
    // Spend credits before recording the unlock, so a failed/insufficient
    // spend never leaves a course_unlocks row behind.
    if (!alreadyUnlocked && cost > 0) {
      try {
        await adjustCredits(req.user.user_id, -cost, {
          sourceType: "learning",
          sourceId: courseId,
          description: `Unlocked interactive path: ${course.title}`,
        });
      } catch (err) {
        if (err instanceof CreditsError) return res.status(err.status).json({ error: err.message });
        throw err;
      }
    }

    const { error } = await supabaseAdmin
      .from("course_unlocks")
      .upsert(
        {
          course_id: courseId,
          user_id: req.user.user_id,
          path: "interactive",
          price_paid: cost,
        },
        { onConflict: "course_id,user_id,path", ignoreDuplicates: true }
      );
    if (error) throw error;

    // Buying a path means the user is a student of the course.
    const { error: enrollError } = await supabaseAdmin
      .from("course_enrollments")
      .upsert(
        { course_id: courseId, user_id: req.user.user_id },
        { onConflict: "course_id,user_id", ignoreDuplicates: true }
      );
    if (enrollError) throw enrollError;

    res.status(201).json({ data: { courseId, path: "interactive" } });
  } catch (err) {
    next(err);
  }
}

// A student may rate a course only after enrolling; one rating per course,
// re-rating overwrites the previous stars.
export async function rateCourse(req, res, next) {
  try {
    const courseId = Number(req.params.id);
    const stars = Number(req.body?.stars);
    if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
      return res.status(400).json({ error: "stars must be an integer from 1 to 5" });
    }

    const { data: enrollment, error: findError } = await supabaseAdmin
      .from("course_enrollments")
      .select("enrollment_id")
      .eq("course_id", courseId)
      .eq("user_id", req.user.user_id)
      .maybeSingle();
    if (findError) throw findError;
    if (!enrollment) {
      return res.status(403).json({ error: "Enroll in the course before rating it" });
    }

    const { error } = await supabaseAdmin
      .from("course_ratings")
      .upsert(
        {
          course_id: courseId,
          user_id: req.user.user_id,
          stars,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "course_id,user_id" }
      );
    if (error) throw error;

    // Return the fresh average so the UI can update without a refetch.
    const { data: allStars, error: avgError } = await supabaseAdmin
      .from("course_ratings")
      .select("stars")
      .eq("course_id", courseId);
    if (avgError) throw avgError;
    const rating =
      Math.round((allStars.reduce((sum, r) => sum + r.stars, 0) / allStars.length) * 10) / 10;

    res.status(201).json({ data: { courseId, stars, rating, ratingCount: allStars.length } });
  } catch (err) {
    next(err);
  }
}

// Everything learning-related about the current user in one call, so the
// frontend hooks can hydrate on page load.
export async function getMyLearning(req, res, next) {
  try {
    const [enrollments, unlocks, ratings] = await Promise.all([
      supabaseAdmin.from("course_enrollments").select("course_id").eq("user_id", req.user.user_id),
      supabaseAdmin.from("course_unlocks").select("course_id").eq("user_id", req.user.user_id),
      supabaseAdmin.from("course_ratings").select("course_id, stars").eq("user_id", req.user.user_id),
    ]);
    if (enrollments.error) throw enrollments.error;
    if (unlocks.error) throw unlocks.error;
    if (ratings.error) throw ratings.error;
    res.json({
      data: {
        enrolledCourseIds: enrollments.data.map((r) => r.course_id),
        unlockedCourseIds: unlocks.data.map((r) => r.course_id),
        // { [courseId]: stars }: the student's own ratings.
        myRatings: Object.fromEntries(ratings.data.map((r) => [r.course_id, r.stars])),
      },
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Admin reporting: who is in each course, and what's happening platform-wide.

// Roster for one course. Admin/staff see any course; a lecturer only their own.
export async function listCourseStudents(req, res, next) {
  try {
    const courseId = Number(req.params.id);
    const { data: course, error: findError } = await supabaseAdmin
      .from("courses")
      .select("course_id, title, instructor_id")
      .eq("course_id", courseId)
      .maybeSingle();
    if (findError) throw findError;
    if (!course) return res.status(404).json({ error: "Course not found" });
    if (!canEditCourse(req.user, course)) {
      return res.status(403).json({ error: "You can only view students of your own courses" });
    }

    const [enrollments, unlocks] = await Promise.all([
      supabaseAdmin
        .from("course_enrollments")
        .select("enrolled_at, student:users(user_id, full_name, email)")
        .eq("course_id", courseId)
        .order("enrolled_at", { ascending: false }),
      supabaseAdmin
        .from("course_unlocks")
        .select("user_id, path, price_paid, created_at")
        .eq("course_id", courseId),
    ]);
    if (enrollments.error) throw enrollments.error;
    if (unlocks.error) throw unlocks.error;

    const unlockByUser = new Map(unlocks.data.map((u) => [u.user_id, u]));
    const students = enrollments.data.map((row) => {
      const unlock = unlockByUser.get(row.student?.user_id);
      return {
        id: row.student?.user_id ?? null,
        name: row.student?.full_name || "Unknown user",
        email: row.student?.email || "",
        enrolledAt: row.enrolled_at,
        purchasedInteractive: Boolean(unlock),
        pricePaid: unlock?.price_paid != null ? Number(unlock.price_paid) : null,
        purchasedAt: unlock?.created_at ?? null,
      };
    });

    res.json({
      data: {
        courseId: course.course_id,
        courseTitle: course.title,
        students,
      },
    });
  } catch (err) {
    next(err);
  }
}

// Platform-wide stats + recent activity for the Learning admin dashboard.
export async function getLearningOverview(req, res, next) {
  try {
    const [enrollments, unlocks] = await Promise.all([
      supabaseAdmin
        .from("course_enrollments")
        .select("enrolled_at, user_id, student:users(full_name), course:courses(course_id, title)")
        .order("enrolled_at", { ascending: false }),
      supabaseAdmin
        .from("course_unlocks")
        .select("created_at, user_id, price_paid, student:users(full_name), course:courses(course_id, title)")
        .order("created_at", { ascending: false }),
    ]);
    if (enrollments.error) throw enrollments.error;
    if (unlocks.error) throw unlocks.error;

    const uniqueStudents = new Set(enrollments.data.map((r) => r.user_id)).size;
    const totalRevenue = unlocks.data.reduce((sum, r) => sum + Number(r.price_paid || 0), 0);

    // One merged feed so the dashboard can show "X enrolled in Y" and
    // "X purchased Y ($Z)" in time order.
    const activity = [
      ...enrollments.data.map((r) => ({
        type: "enrollment",
        student: r.student?.full_name || "Unknown user",
        courseId: r.course?.course_id ?? null,
        courseTitle: r.course?.title || "Deleted course",
        at: r.enrolled_at,
      })),
      ...unlocks.data.map((r) => ({
        type: "purchase",
        student: r.student?.full_name || "Unknown user",
        courseId: r.course?.course_id ?? null,
        courseTitle: r.course?.title || "Deleted course",
        price: r.price_paid != null ? Number(r.price_paid) : null,
        at: r.created_at,
      })),
    ]
      .sort((a, b) => new Date(b.at) - new Date(a.at))
      .slice(0, 20);

    res.json({
      data: {
        totalEnrollments: enrollments.data.length,
        uniqueStudents,
        totalPurchases: unlocks.data.length,
        totalRevenue,
        activity,
      },
    });
  } catch (err) {
    next(err);
  }
}
