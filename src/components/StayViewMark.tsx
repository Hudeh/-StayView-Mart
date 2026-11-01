/** Same StayView wordmark as the main app login, with the Mart product name. */
export function StayViewMartMark() {
  return (
    <div className="brand">
      <svg
        className="brand-logo"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 118 44"
        aria-label="StayView"
        role="img"
      >
        <text
          fontFamily='Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
          fontWeight="700"
          fontSize="28"
          letterSpacing="-1"
          x="0"
          y="32"
        >
          <tspan fill="#7352c7">Stay</tspan>
          <tspan fill="currentColor">View</tspan>
        </text>
        <rect x="0" y="40" width="36" height="2.5" rx="1.25" fill="#7352c7" />
      </svg>
      <span className="brand-sep" aria-hidden="true">
        ||
      </span>
      <span className="brand-product">Mart</span>
    </div>
  );
}
