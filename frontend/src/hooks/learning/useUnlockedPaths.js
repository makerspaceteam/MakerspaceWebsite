import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../hub/AuthContext";
import { learningApi } from "../../lib/api/learning";

/**
 * Tracks which courses' Interactive path the learner has unlocked by
 * spending credits (course_unlocks, server-side). Credits only exist on a
 * membership row, so unlocking requires a signed-in member — no guest
 * fallback here.
 */
export function useUnlockedPaths() {
  const [unlocked, setUnlocked] = useState([]);
  const signedIn = Boolean(useAuth()?.user);

  useEffect(() => {
    if (!signedIn) return;
    learningApi
      .myLearning()
      .then(({ unlockedCourseIds }) => setUnlocked(unlockedCourseIds))
      .catch(() => {
        /* token invalid or backend down, keep the empty list */
      });
  }, [signedIn]);

  const isUnlocked = useCallback(
    (courseId) => unlocked.includes(Number(courseId)),
    [unlocked]
  );

  // Spends credits server-side; throws on failure (e.g. insufficient
  // credits, no membership) so the caller can surface the real error.
  const unlock = useCallback(async (courseId) => {
    const id = Number(courseId);
    await learningApi.unlock(id);
    setUnlocked((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }, []);

  return { isUnlocked, unlock };
}
