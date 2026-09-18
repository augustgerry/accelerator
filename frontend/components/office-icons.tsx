import React from "react";

interface OfficeIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
  className?: string;
}

/**
 * Microsoft Word Official Fluent Style SVG Icon
 */
export function WordIcon({ size = 24, className = "", ...props }: OfficeIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...props}
    >
      <rect x="10" y="4" width="30" height="40" rx="3" fill="#185ABD" />
      <path
        d="M26 4H37C38.6569 4 40 5.34315 40 7V41C40 42.6569 38.6569 44 37 44H26V4Z"
        fill="#04397A"
        fillOpacity="0.4"
      />
      <rect x="23" y="11" width="12" height="3" rx="1.5" fill="white" fillOpacity="0.8" />
      <rect x="23" y="17" width="12" height="3" rx="1.5" fill="white" fillOpacity="0.8" />
      <rect x="23" y="23" width="12" height="3" rx="1.5" fill="white" fillOpacity="0.8" />
      <rect x="23" y="29" width="12" height="3" rx="1.5" fill="white" fillOpacity="0.8" />
      <rect x="23" y="35" width="8" height="3" rx="1.5" fill="white" fillOpacity="0.8" />
      {/* Front W Tile */}
      <rect
        x="4"
        y="12"
        width="24"
        height="24"
        rx="3"
        fill="#103F91"
        filter="drop-shadow(0 2px 4px rgba(0,0,0,0.25))"
      />
      <path
        d="M9.5 17.5L12 28.5L14.5 21L17.5 28.5L20 17.5H22.5L18.8 30.5H16.2L13.5 23L10.8 30.5H8.2L4.5 17.5H7L9.5 26.5"
        fill="white"
      />
    </svg>
  );
}

/**
 * Microsoft PowerPoint Official Fluent Style SVG Icon
 */
export function PowerPointIcon({ size = 24, className = "", ...props }: OfficeIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...props}
    >
      <rect x="10" y="4" width="30" height="40" rx="3" fill="#D24726" />
      <path
        d="M26 4H37C38.6569 4 40 5.34315 40 7V41C40 42.6569 38.6569 44 37 44H26V4Z"
        fill="#821B00"
        fillOpacity="0.4"
      />
      {/* Chart preview in PowerPoint slide */}
      <circle cx="30" cy="18" r="6" stroke="white" strokeWidth="2.5" strokeDasharray="24 10" strokeOpacity="0.9" fill="none" />
      <rect x="23" y="27" width="13" height="2" rx="1" fill="white" fillOpacity="0.8" />
      <rect x="23" y="32" width="9" height="2" rx="1" fill="white" fillOpacity="0.8" />
      {/* Front P Tile */}
      <rect
        x="4"
        y="12"
        width="24"
        height="24"
        rx="3"
        fill="#B73A1B"
        filter="drop-shadow(0 2px 4px rgba(0,0,0,0.25))"
      />
      <path
        d="M10 18H16C18.2091 18 20 19.7909 20 22C20 24.2091 18.2091 26 16 26H13V30H10V18ZM13 23.5H16C16.8284 23.5 17.5 22.8284 17.5 22C17.5 21.1716 16.8284 20.5 16 20.5H13V23.5Z"
        fill="white"
      />
    </svg>
  );
}

/**
 * Adobe / Standard PDF Document Official Style SVG Icon
 */
export function PdfIcon({ size = 24, className = "", ...props }: OfficeIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...props}
    >
      <rect x="8" y="4" width="32" height="40" rx="3" fill="#E5252A" />
      <path
        d="M28 4L40 16V41C40 42.6569 38.6569 44 37 44H11C9.34315 44 8 42.6569 8 41V7C8 5.34315 9.34315 4 11 4H28Z"
        fill="#D92228"
      />
      <path d="M28 4V14C28 15.1046 28.8954 16 30 16H40L28 4Z" fill="#FEE5E6" fillOpacity="0.6" />
      {/* Front PDF Ribbon / Badge */}
      <rect x="6" y="22" width="36" height="14" rx="2" fill="#BA1B1F" filter="drop-shadow(0 2px 4px rgba(0,0,0,0.25))" />
      <text
        x="24"
        y="32.5"
        textAnchor="middle"
        fill="white"
        fontSize="10"
        fontWeight="800"
        fontFamily="system-ui, -apple-system, sans-serif"
        letterSpacing="0.8"
      >
        PDF
      </text>
    </svg>
  );
}

/**
 * Microsoft Excel Official Fluent Style SVG Icon
 */
export function ExcelIcon({ size = 24, className = "", ...props }: OfficeIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...props}
    >
      <rect x="10" y="4" width="30" height="40" rx="3" fill="#107C41" />
      <path
        d="M26 4H37C38.6569 4 40 5.34315 40 7V41C40 42.6569 38.6569 44 37 44H26V4Z"
        fill="#084E25"
        fillOpacity="0.4"
      />
      <rect x="23" y="11" width="6" height="4" fill="white" fillOpacity="0.8" />
      <rect x="31" y="11" width="6" height="4" fill="white" fillOpacity="0.8" />
      <rect x="23" y="17" width="6" height="4" fill="white" fillOpacity="0.8" />
      <rect x="31" y="17" width="6" height="4" fill="white" fillOpacity="0.8" />
      <rect x="23" y="23" width="6" height="4" fill="white" fillOpacity="0.8" />
      <rect x="31" y="23" width="6" height="4" fill="white" fillOpacity="0.8" />
      {/* Front X Tile */}
      <rect
        x="4"
        y="12"
        width="24"
        height="24"
        rx="3"
        fill="#0E5C2F"
        filter="drop-shadow(0 2px 4px rgba(0,0,0,0.25))"
      />
      <path
        d="M9 18L13.5 24L9 30H12L15 25.5L18 30H21L16.5 24L21 18H18L15 22.5L12 18H9Z"
        fill="white"
      />
    </svg>
  );
}
