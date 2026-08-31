import { useState, useEffect, useRef } from "react";
import { Link, useParams, useNavigate, useLocation } from "react-router-dom";
import { ChevronRight, ChevronLeft, Calendar, MapPin, Users, X, Camera, Maximize2 } from "lucide-react";
import {
  fetchEventById, formatEventDate, getEventStatus,
  fetchMyEventRegistrations, registerForEvent,
} from "@/lib/events-data";
import { useAuth } from "@/hub/AuthContext";
import { Button } from "@/components/community/ui/button";
import MarkdownText from "@/components/community/MarkdownText";

export default function EventDetailPage() {
  const { eventId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  const [registered, setRegistered] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  // Index into event.images for the lightbox; null = closed.
  const [lightboxIndex, setLightboxIndex] = useState(null);
  // Which image the cover carousel is currently showing — separate from the
  // lightbox so arrow-stepping through the cover doesn't need the modal open.
  const [coverIndex, setCoverIndex] = useState(0);
  // Mobile cover swipes natively instead of using the arrow columns (no
  // width to spare on a small screen) — this tracks scroll position back
  // into coverIndex so the counter badge stays in sync.
  const mobileScrollRef = useRef(null);
  const handleMobileScroll = () => {
    const el = mobileScrollRef.current;
    if (!el) return;
    setCoverIndex(Math.round(el.scrollLeft / el.clientWidth));
  };

  useEffect(() => {
    setLoading(true);
    setLoadFailed(false);
    setLightboxIndex(null);
    setCoverIndex(0);
    Promise.all([
      fetchEventById(eventId),
      user ? fetchMyEventRegistrations() : Promise.resolve([]),
    ])
      .then(([ev, myIds]) => {
        setEvent(ev);
        setRegistered(myIds.includes(Number(eventId)));
      })
      .catch((err) => {
        setEvent(null);
        if (err.status !== 404) setLoadFailed(true);
      })
      .finally(() => setLoading(false));
    // user?.id, not user — AuthContext's refreshMembership() replaces the
    // whole user object with a new reference once membership data lands,
    // even though the id (and thus what this effect needs to know) hasn't
    // changed; depending on the object itself re-ran this fetch 2-3x on
    // every page load.
  }, [eventId, user?.id]);

  // One-way — no self-service unregister. If someone can't make it, an
  // admin removes them from the Registrants panel so the spot frees up.
  const handleRegister = async () => {
    if (!user) {
      navigate("/login", { state: { from: location.pathname } });
      return;
    }
    setError("");
    setWorking(true);
    // Optimistic — bump the count and lock in "Registered" right away instead
    // of waiting on requireAuth's user lookup + the RPC's own serialized
    // queries; roll both back if the request turns out to have failed.
    setRegistered(true);
    setEvent((prev) => ({ ...prev, participants: prev.participants + 1 }));
    try {
      await registerForEvent(eventId);
    } catch (err) {
      setError(err.message);
      setRegistered(false);
      setEvent((prev) => ({ ...prev, participants: prev.participants - 1 }));
    } finally {
      setWorking(false);
    }
  };

  if (loading) {
    return <div className="mx-auto max-w-3xl px-6 py-24 text-center text-muted-foreground">Loading…</div>;
  }

  if (!event) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-24 text-center">
        <h1 className="text-4xl font-semibold">{loadFailed ? "Couldn't load this event" : "Event not found"}</h1>
        <p className="mt-2 text-muted-foreground">
          {loadFailed ? "Something went wrong loading this page — please try again." : "This event doesn't exist or has been removed."}
        </p>
        <Link to="/community/eventspace" className="mt-6 inline-block text-events underline">
          Back to all events
        </Link>
      </div>
    );
  }

  const participants = event.participants;
  const pct = event.capacity ? Math.min(100, Math.round((participants / event.capacity) * 100)) : 0;

  // Mirrors the backend's own gate (eventRegistrations.routes.js): once the
  // event has started, or every spot is taken, registration closes — this
  // just reflects that in the UI instead of letting a click round-trip fail.
  const status = getEventStatus(event);
  const isFull = event.capacity > 0 && participants >= event.capacity;
  const canRegister = status === "upcoming" && !isFull;

  return (
    <main className="bg-background">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 pt-6 pb-24">
        {/* Breadcrumb — now a plain nav row above the cover instead of an
            overlay, since the cover no longer fills edge-to-edge (it shows
            the whole image via object-contain, not a crop). */}
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-muted-foreground flex-wrap">
          <Link to="/" className="hover:text-foreground transition-colors">Home</Link>
          <ChevronRight className="size-3.5 shrink-0 opacity-50" />
          <Link to="/community" className="hover:text-foreground transition-colors">Community</Link>
          <ChevronRight className="size-3.5 shrink-0 opacity-50" />
          <Link to="/community/eventspace" className="hover:text-foreground transition-colors">Events</Link>
          <ChevronRight className="size-3.5 shrink-0 opacity-50" />
          <span className="text-foreground font-medium truncate max-w-[200px] sm:max-w-sm">{event.title}</span>
        </nav>

        {/* Cover block — side arrows step through every photo in place (see
            below), and clicking the photo opens the full lightbox. Kept
            short (no thumbnail strip) so the title/details below are
            visible without scrolling. */}
        <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-card">
          {/* Tablet/desktop — arrows live in their own side columns (not
              overlaid on the photo), which also naturally makes the photo
              itself shorter since it keeps its 2:1 ratio at a narrower
              width. Steps through images in place, separate from the
              lightbox's own prev/next below. */}
          <div className="hidden items-stretch sm:flex">
            {event.images.length > 1 && (
              <button
                type="button"
                onClick={() => setCoverIndex((i) => (i - 1 + event.images.length) % event.images.length)}
                className="flex w-14 shrink-0 items-center justify-center bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Previous photo"
              >
                <ChevronLeft className="size-5" />
              </button>
            )}

            <div className="group relative aspect-[2/1] min-w-0 flex-1 overflow-hidden bg-muted">
              <button
                type="button"
                onClick={() => setLightboxIndex(coverIndex)}
                className="absolute inset-0 block h-full w-full"
              >
                <img src={event.images[coverIndex]} alt={event.title} className="h-full w-full object-contain" />
                <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all duration-200 group-hover:bg-black/30 group-hover:opacity-100">
                  <span className="badge bg-black/60 text-white">
                    <Maximize2 className="size-3.5" /> View {event.images.length > 1 ? "photos" : "photo"}
                  </span>
                </div>
              </button>

              {event.images.length > 1 && (
                <span className="badge badge-sm pointer-events-none absolute bottom-3 right-3 bg-black/60 text-white">
                  <Camera className="size-3.5" /> {coverIndex + 1} / {event.images.length}
                </span>
              )}
            </div>

            {event.images.length > 1 && (
              <button
                type="button"
                onClick={() => setCoverIndex((i) => (i + 1) % event.images.length)}
                className="flex w-14 shrink-0 items-center justify-center bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Next photo"
              >
                <ChevronRight className="size-5" />
              </button>
            )}
          </div>

          {/* Mobile — no room for side arrow columns, so this swipes/scrolls
              natively instead. key={eventId} resets scroll position when
              navigating between events. */}
          <div className="relative sm:hidden">
            <div
              key={eventId}
              ref={mobileScrollRef}
              onScroll={handleMobileScroll}
              className="flex snap-x snap-mandatory overflow-x-auto"
            >
              {event.images.map((src, i) => (
                <button
                  key={src + i}
                  type="button"
                  onClick={() => setLightboxIndex(i)}
                  className="aspect-[2/1] w-full flex-none snap-center overflow-hidden bg-muted"
                >
                  <img src={src} alt={`${event.title} — image ${i + 1}`} className="h-full w-full object-contain" />
                </button>
              ))}
            </div>
            {event.images.length > 1 && (
              <span className="pointer-events-none absolute bottom-3 right-3 flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-xs font-semibold text-white">
                <Camera className="size-3.5" /> {coverIndex + 1} / {event.images.length}
              </span>
            )}
          </div>
        </div>

        <div className="mt-6 grid gap-10 lg:grid-cols-3">
          <article className="lg:col-span-2">
            <div className="flex flex-wrap gap-2">
              {event.tags.map((tag) => (
                <span
                  key={tag}
                  className="badge bg-events/15 text-events"
                >
                  #{tag}
                </span>
              ))}
            </div>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight">
              {event.title}
            </h1>
            <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="size-4" />
                {event.endDate && event.endDate !== event.date
                  ? <>{formatEventDate(event.date)} <span className="opacity-60">→</span> {formatEventDate(event.endDate)}</>
                  : formatEventDate(event.date)}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="size-4" /> {event.location}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Users className="size-4" /> {participants} attending
              </span>
            </div>
            <div className="mt-8 flex items-center gap-3 rounded-2xl border border-border p-4">
              <img
                src={event.author.avatar}
                alt={event.author.name}
                className="size-12 rounded-full object-cover"
              />
              <div>
                <p className="text-sm font-semibold">{event.author.name}</p>
                <p className="text-xs text-muted-foreground">{event.author.role}</p>
              </div>
            </div>
            <div className="mt-8 max-w-none">
              <h2 className="text-xl font-semibold">About this event</h2>
              <MarkdownText text={event.description} />
            </div>
          </article>
          <aside className="lg:sticky lg:top-24 h-fit">
            <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Registration</p>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-3xl font-semibold">{participants}</span>
                <span className="text-sm text-muted-foreground">/ {event.capacity} spots</span>
              </div>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-events transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
              {registered ? (
                <Button className="btn-secondary mt-5 w-full border-events text-events bg-transparent" disabled>
                  Registered ✓
                </Button>
              ) : canRegister && event.registrationUrl ? (
                <Button asChild className="btn-primary mt-5 w-full bg-events text-events-foreground hover:bg-events/90">
                  <a href={event.registrationUrl} target="_blank" rel="noreferrer">
                    Register (external form) ↗
                  </a>
                </Button>
              ) : canRegister ? (
                <Button
                  className="btn-primary mt-5 w-full bg-events text-events-foreground hover:bg-events/90"
                  disabled={working}
                  onClick={handleRegister}
                >
                  {working ? "…" : "Register for this event"}
                </Button>
              ) : status === "ongoing" ? (
                <div className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 py-2.5">
                  <span className="relative flex h-2 w-2 shrink-0">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75 animate-ping" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
                  </span>
                  <span className="text-sm font-semibold text-red-700">Ongoing — registration closed</span>
                </div>
              ) : status === "ended" ? (
                <div className="mt-5 w-full rounded-lg border border-border bg-muted/50 py-2.5 text-center text-sm font-medium text-muted-foreground">
                  Event ended
                </div>
              ) : (
                <div className="mt-5 w-full rounded-lg border border-border bg-muted/50 py-2.5 text-center text-sm font-medium text-muted-foreground">
                  Event is full
                </div>
              )}
              {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
              {registered && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Can't make it? Contact the organizer to be removed.
                </p>
              )}
            </div>

            {/* Photos — only relevant once the event has actually happened;
                galleryUrl is added by staff afterward (e.g. a Google Drive
                folder), so this shows a placeholder until then. */}
            {status === "ended" && (
              <div className="mt-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Photos</p>
                {event.galleryUrl ? (
                  <Button asChild className="btn-primary mt-3 w-full bg-events text-events-foreground hover:bg-events/90">
                    <a href={event.galleryUrl} target="_blank" rel="noreferrer">
                      <Camera className="size-3.5" /> View event gallery ↗
                    </a>
                  </Button>
                ) : (
                  <div className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-muted/50 py-2.5 text-sm font-medium text-muted-foreground">
                    <Camera className="size-4" /> Gallery coming soon
                  </div>
                )}
              </div>
            )}
          </aside>
        </div>
      </div>

      {/* Lightbox — plain dark backdrop + object-contain, so a portrait
          poster shows whole instead of getting cropped like the hero cover. */}
      {lightboxIndex !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setLightboxIndex(null)}
        >
          <button
            type="button"
            onClick={() => setLightboxIndex(null)}
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
          {event.images.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setLightboxIndex((i) => (i - 1 + event.images.length) % event.images.length); }}
                className="absolute left-3 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
                aria-label="Previous image"
              >
                <ChevronLeft className="size-5" />
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setLightboxIndex((i) => (i + 1) % event.images.length); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
                aria-label="Next image"
              >
                <ChevronRight className="size-5" />
              </button>
            </>
          )}
          <img
            src={event.images[lightboxIndex]}
            alt={`${event.title} — image ${lightboxIndex + 1}`}
            className="max-h-full max-w-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </main>
  );
}
