import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useAppStore } from "../../store/appStore";

const GALAXY_TOUR_KEY = "pypimap.galaxyTour.v3";
const PAD = 10;
const HOLE_PAD = 8;
const CARD_W = 268;

const STEPS = [
  {
    title: "Move",
    points: [
      "Drag to pan",
      "Scroll to zoom",
      "Full view resets the map",
    ],
    // Whole Galaxy map + Full view button
    anchor: "map",
  },
  {
    title: "Pick a package",
    points: ["Search by name", "Or click a bright hub"],
    anchor: "search",
  },
  {
    title: "Pin panel",
    points: [
      "Show optional = extra packages",
      "Panel = package info",
      "Blue / green = Depends on / Used by",
    ],
    anchor: "side",
  },
  {
    title: "More later",
    points: ["Guide = glossary + API", "Connect MCP = agents"],
    anchor: "nav-more",
  },
];

function isGalaxyTourDone() {
  try {
    return localStorage.getItem(GALAXY_TOUR_KEY) === "done";
  } catch {
    return true;
  }
}

function markGalaxyTourDone() {
  try {
    localStorage.setItem(GALAXY_TOUR_KEY, "done");
  } catch {
    /* private mode */
  }
}

function rectOf(el) {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return null;
  return {
    top: r.top,
    left: r.left,
    right: r.right,
    bottom: r.bottom,
    width: r.width,
    height: r.height,
  };
}

function unionRects(a, b) {
  if (!a) return b;
  if (!b) return a;
  return {
    top: Math.min(a.top, b.top),
    left: Math.min(a.left, b.left),
    right: Math.max(a.right, b.right),
    bottom: Math.max(a.bottom, b.bottom),
    width: 0,
    height: 0,
  };
}

function withPad(r, pad) {
  if (!r) return null;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const top = Math.max(0, r.top - pad);
  const left = Math.max(0, r.left - pad);
  const right = Math.min(vw, r.right + pad);
  const bottom = Math.min(vh, r.bottom + pad);
  return {
    top,
    left,
    right,
    bottom,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}

function resolveSpot(kind) {
  if (kind === "map") {
    // Full Galaxy stage (map + Full view). Card sits in a free corner.
    return rectOf(document.querySelector(".galaxy-stage"));
  }
  if (kind === "search") {
    return rectOf(document.querySelector(".shell-search"));
  }
  if (kind === "side") {
    const legend = rectOf(document.querySelector(".galaxy-side-legend"));
    const side = rectOf(document.querySelector(".galaxy-side"));
    // Legend is the “Show optional” story; include a bit of the card above.
    if (legend && side) {
      const top = Math.max(side.top, legend.top - 56);
      return {
        top,
        left: side.left,
        right: side.right,
        bottom: side.bottom,
        width: side.right - side.left,
        height: side.bottom - top,
      };
    }
    return legend || side;
  }
  if (kind === "nav-more") {
    const guide = [...document.querySelectorAll(".shell-nav-link")].find(
      (b) => b.textContent.trim() === "Guide",
    );
    const mcp = document.querySelector(".shell-mcp");
    return unionRects(rectOf(guide), rectOf(mcp));
  }
  return null;
}

function placeCard(spot, cardW, cardH) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const clamp = (top, left) => ({
    top: Math.min(Math.max(PAD, top), Math.max(PAD, vh - cardH - PAD)),
    left: Math.min(Math.max(PAD, left), Math.max(PAD, vw - cardW - PAD)),
  });

  if (!spot) {
    return clamp(vh - cardH - 24, (vw - cardW) / 2);
  }

  const gap = 12;
  const mobile = vw <= 768;
  const spotArea = spot.width * spot.height;
  const viewArea = vw * vh;
  // Large spotlight (e.g. full Galaxy): float the card in a corner of the hole
  // so the map + Full view stay visible around it.
  if (spotArea > viewArea * 0.35) {
    if (mobile) {
      return clamp(spot.bottom - cardH - 16, (vw - cardW) / 2);
    }
    return clamp(spot.bottom - cardH - 20, spot.left + 16);
  }

  const candidates = mobile
    ? [
        { top: spot.top - cardH - gap, left: (vw - cardW) / 2 },
        { top: spot.bottom + gap, left: (vw - cardW) / 2 },
        { top: Math.max(PAD, (vh - cardH) / 2), left: (vw - cardW) / 2 },
      ]
    : [
        { top: spot.bottom + gap, left: spot.left },
        { top: spot.bottom + gap, left: spot.right - cardW },
        { top: spot.top - cardH - gap, left: spot.left },
        { top: spot.top, left: spot.left - cardW - gap },
        { top: spot.top, left: spot.right + gap },
        { top: spot.top - cardH - gap, left: spot.right - cardW },
      ];

  let best = null;
  let bestScore = -Infinity;
  for (const c of candidates) {
    const p = clamp(c.top, c.left);
    const card = {
      top: p.top,
      left: p.left,
      right: p.left + cardW,
      bottom: p.top + cardH,
    };
    const overlapX = Math.max(
      0,
      Math.min(card.right, spot.right) - Math.max(card.left, spot.left),
    );
    const overlapY = Math.max(
      0,
      Math.min(card.bottom, spot.bottom) - Math.max(card.top, spot.top),
    );
    const overlap = overlapX * overlapY;
    const inView =
      Math.min(card.right, vw) -
      Math.max(card.left, 0) +
      (Math.min(card.bottom, vh) - Math.max(card.top, 0));
    const score = inView - overlap * 4;
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return best || clamp(vh - cardH - 24, (vw - cardW) / 2);
}

/**
 * First-visit tour: blur/dim the page except a spotlight on the control.
 */
function GalaxyTour({ active }) {
  const titleId = useId();
  const cardRef = useRef(null);
  const setActiveView = useAppStore((s) => s.setActiveView);
  const [open, setOpen] = useState(() => active && !isGalaxyTourDone());
  const [step, setStep] = useState(0);
  const [spot, setSpot] = useState(null);
  const [pos, setPos] = useState({ top: 80, left: 24 });

  useEffect(() => {
    if (!active) return;
    if (isGalaxyTourDone()) {
      setOpen(false);
      return;
    }
    setOpen(true);
  }, [active]);

  const dismiss = useCallback(() => {
    markGalaxyTourDone();
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!open || !active) return undefined;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      dismiss();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, active, dismiss]);

  const updateLayout = useCallback(() => {
    const current = STEPS[step];
    if (!current) return;
    const raw = resolveSpot(current.anchor);
    const hole = withPad(raw, HOLE_PAD);
    if (hole) {
      hole.width = hole.right - hole.left;
      hole.height = hole.bottom - hole.top;
    }
    setSpot(hole);
    const card = cardRef.current;
    const cardH = card?.offsetHeight || 170;
    const cardW = Math.min(CARD_W, window.innerWidth - PAD * 2);
    setPos(placeCard(hole, cardW, cardH));
  }, [step]);

  useLayoutEffect(() => {
    if (!open || !active) return undefined;
    updateLayout();
    // Re-measure after paint (card height) and on resize.
    const t = window.setTimeout(updateLayout, 40);
    const onWin = () => updateLayout();
    window.addEventListener("resize", onWin);
    window.addEventListener("scroll", onWin, true);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("resize", onWin);
      window.removeEventListener("scroll", onWin, true);
    };
  }, [open, active, step, updateLayout]);

  if (!active || !open) return null;

  const last = step >= STEPS.length - 1;
  const current = STEPS[step];
  const vw = typeof window !== "undefined" ? window.innerWidth : 0;
  const vh = typeof window !== "undefined" ? window.innerHeight : 0;
  const s = spot || { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 };

  const panes = [
    {
      key: "top",
      style: { top: 0, left: 0, width: vw, height: Math.max(0, s.top) },
    },
    {
      key: "left",
      style: {
        top: s.top,
        left: 0,
        width: Math.max(0, s.left),
        height: Math.max(0, s.height),
      },
    },
    {
      key: "right",
      style: {
        top: s.top,
        left: s.right,
        width: Math.max(0, vw - s.right),
        height: Math.max(0, s.height),
      },
    },
    {
      key: "bottom",
      style: {
        top: s.bottom,
        left: 0,
        width: vw,
        height: Math.max(0, vh - s.bottom),
      },
    },
  ];

  // Portal to body so the spotlight sits above shell-nav (nav z-index 30
  // would otherwise cover Guide / MCP when the tour lived under .galaxy-root).
  return createPortal(
    <div
      className="galaxy-tour"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      {panes.map((p) => (
        <button
          key={p.key}
          type="button"
          className="galaxy-tour-pane"
          style={p.style}
          aria-label="Dismiss tour"
          onClick={dismiss}
        />
      ))}

      {spot && spot.width > 0 && (
        <div
          className="galaxy-tour-hole"
          style={{
            top: spot.top,
            left: spot.left,
            width: spot.width,
            height: spot.height,
          }}
          aria-hidden
        />
      )}

      <div
        ref={cardRef}
        className="galaxy-tour-card"
        style={{ top: pos.top, left: pos.left }}
      >
        <p className="galaxy-tour-kicker">
          Tour {step + 1}/{STEPS.length}
        </p>
        <h2 id={titleId} className="galaxy-tour-title">
          {current.title}
        </h2>
        <ul className="galaxy-tour-points">
          {current.points.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <div className="galaxy-tour-actions">
          <button
            type="button"
            className="galaxy-tour-btn galaxy-tour-btn--ghost"
            onClick={dismiss}
          >
            Skip
          </button>
          <div className="galaxy-tour-actions-end">
            {step > 0 && (
              <button
                type="button"
                className="galaxy-tour-btn galaxy-tour-btn--ghost"
                onClick={() => setStep((n) => Math.max(0, n - 1))}
              >
                Back
              </button>
            )}
            {!last ? (
              <button
                type="button"
                className="galaxy-tour-btn galaxy-tour-btn--primary"
                onClick={() => setStep((n) => n + 1)}
              >
                Next
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="galaxy-tour-btn galaxy-tour-btn--ghost"
                  onClick={() => {
                    dismiss();
                    setActiveView("guide");
                  }}
                >
                  Guide
                </button>
                <button
                  type="button"
                  className="galaxy-tour-btn galaxy-tour-btn--primary"
                  onClick={dismiss}
                >
                  Done
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default GalaxyTour;
