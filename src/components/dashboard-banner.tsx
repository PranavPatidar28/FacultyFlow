import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";

export function DashboardBanner() {
  return (
    <section
      className="schedule-banner"
      aria-labelledby="schedule-banner-title"
    >
      <div className="schedule-banner-content">
        <h2 id="schedule-banner-title">Weekly timetable</h2>
        <Link href="/timetable">
          View timetable <ArrowRight size={18} />
        </Link>
      </div>
      <div className="schedule-art" aria-hidden="true">
        <div className="schedule-orbit schedule-orbit-one" />
        <div className="schedule-orbit schedule-orbit-two" />
        <div className="schedule-art-card">
          <div className="schedule-art-header">
            <span />
            <span />
            <i />
          </div>
          <div className="schedule-art-grid">
            {Array.from({ length: 20 }, (_, index) => (
              <span
                key={index}
                className={
                  [1, 4, 8, 12, 15, 18].includes(index)
                    ? "schedule-art-filled"
                    : undefined
                }
              />
            ))}
          </div>
        </div>
        <span className="schedule-art-check">
          <Check size={26} strokeWidth={1.8} />
        </span>
        <div className="schedule-art-label">
          <span>
            <Check size={14} />
          </span>
          <i />
        </div>
        <svg
          className="schedule-art-sparkle"
          width="32"
          height="32"
          viewBox="0 0 32 32"
          fill="none"
        >
          <path
            d="M16 1v30M1 16h30M5 5l22 22M5 27 27 5"
            stroke="currentColor"
            strokeWidth="1.3"
          />
        </svg>
      </div>
    </section>
  );
}
