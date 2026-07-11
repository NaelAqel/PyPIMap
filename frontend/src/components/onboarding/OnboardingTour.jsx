import { useState, useEffect } from "react";
import { useMediaQuery } from "../../hooks/useMediaQuery";

const STORAGE_KEY = "pypimap_tour_seen";

const steps = [
  {
    title: "Search & Filters",
    text: "",
    bullets: [
        "Search any package on PyPI here.", 
        "Toggle to show optional dependencies"
    ],
    position: "top-left",
  },
  {
    title: "Info & Legend",
    text: "This shows details about the selected package:",
    bullets: [
      "White = focused package",
      "Blue = upstream",
      "Orange = downstream",
      "Dashed = optional",
    ],
    position: "top-right",
  },
  {
    title: "Interacting with the Graph",
    text: null,
    bullets: [
      "Drag any node except the focused one",
      "Click to expand further upstream or downstream",
      "Double-click to open that package's own page",
    ],
    position: "center",
  },
  {
    title: "Show More",
    text: "`+N more parents/children` Nodes are collapsed. Click one to reveal the rest.",
    bullets: [],
    position: "center",
  },
  {
    title: "Reset View",
    text: "Lost in the graph? Click here to reset back to the center.",
    bullets: [],
    position: "top-center",
  },
];

const positionClasses = {
  "top-left": "top-24 left-4 md:left-[300px]",
  "top-right": "top-24 right-4",
  "top-center": "top-12 left-1/2 -translate-x-1/2",
  center: "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
};

const mobilePositionClasses = {
  "top-left": "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
  "top-right": "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
  center: "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
  "top-center": "top-20 left-1/2 -translate-x-1/2",
};

function OnboardingTour() {
  const [stepIndex, setStepIndex] = useState(0);
  const [visible, setVisible] = useState(false);
  const isMobile = useMediaQuery();

  useEffect(() => {
    const seen = localStorage.getItem(STORAGE_KEY);
    if (!seen) {
      const timer = setTimeout(() => setVisible(true), 600);
      return () => clearTimeout(timer);
    }
  }, []);

  function closeTour() {
    setVisible(false);
    localStorage.setItem(STORAGE_KEY, "true");
  }

  function nextStep() {
    if (stepIndex === steps.length - 1) {
      closeTour();
    } else {
      setStepIndex((prev) => prev + 1);
    }
  }

  useEffect(() => {
    if (!visible) return;
    function handleKey(e) {
      if (e.key === "Escape") closeTour();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [visible]);


  if (!visible) return null;

  const step = steps[stepIndex];
  const posClass = isMobile
    ? mobilePositionClasses[step.position]
    : positionClasses[step.position];

  return (
    <>
      {/* Full-screen dim backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[1px]"
        onClick={closeTour}
      />
      <div
        role="dialog"
        aria-live="polite"
        className={`fixed z-50 w-[280px] bg-slate-900 text-white rounded-lg shadow-2xl p-4 border-2 border-sky-400 ${posClass}`}
      >
        <h3 className="text-sky-400 font-bold text-sm mb-2">{step.title}</h3>
        {step.text && <p className="text-sm mb-2">{step.text}</p>}
        {step.bullets && step.bullets.length > 0 && (
          <ul className="text-sm list-disc list-inside space-y-1 text-slate-200">
            {step.bullets.map((bullet, i) => (
              <li key={i}>{bullet}</li>
            ))}
          </ul>
        )}
        <div className="flex items-center justify-between mt-4">
          <span className="text-xs text-slate-400">
            Step {stepIndex + 1} of {steps.length}
          </span>
          <div className="flex gap-2">
            <button
              onClick={closeTour}
              className="text-xs text-slate-400 hover:text-white underline"
            >
              Skip
            </button>
            <button
              onClick={nextStep}
              className="text-xs bg-sky-600 hover:bg-sky-500 px-2 py-1 rounded-md font-medium"
            >
              {stepIndex === steps.length - 1 ? "Done" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export default OnboardingTour;