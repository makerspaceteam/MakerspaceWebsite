import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../hub/AuthContext";
import { learningApi } from "../../lib/api/learning";

/**
 * Enrollment + rating state for one course. Guests are never enrolled;
 * enrollment lives server-side (course_enrollments) so the admin dashboard
 * counts real students. `loaded` flips true once the server has answered,
 * so UIs can wait before deciding to show the enroll prompt.
 */
export function useEnrollment(courseId) {
  const id = Number(courseId);
  // Session is an HttpOnly cookie now, so "signed in" comes from AuthContext
  // (which asked the server) instead of peeking at localStorage.
  const auth = useAuth();
  const authLoading = auth?.loading ?? false;
  const signedIn = Boolean(auth?.user);
  const [enrolled, setEnrolled] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [myStars, setMyStars] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!signedIn || !id) { setLoaded(true); return; }
    learningApi
      .myLearning()
      .then(({ enrolledCourseIds, myRatings }) => {
        setEnrolled(enrolledCourseIds.includes(id));
        setMyStars(myRatings?.[id] || 0);
      })
      .catch(() => {
        /* backend down or token invalid, leave as not enrolled */
      })
      .finally(() => setLoaded(true));
  }, [authLoading, signedIn, id]);

  const enroll = useCallback(async () => {
    if (!signedIn || !id) return false;
    setEnrolling(true);
    try {
      await learningApi.enroll(id);
      setEnrolled(true);
      return true;
    } catch {
      return false;
    } finally {
      setEnrolling(false);
    }
  }, [signedIn, id]);

  // Returns the fresh course average { rating, ratingCount } or null.
  const rate = useCallback(
    async (stars) => {
      if (!signedIn || !id) return null;
      const result = await learningApi.rate(id, stars);
      setMyStars(stars);
      return result;
    },
    [signedIn, id]
  );

  return { signedIn, enrolled, enrolling, loaded, myStars, enroll, rate, setEnrolled };
}
