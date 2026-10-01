import React from 'react'

// The glow itself lives in `.blur-circle` (index.css): a static gradient, and a
// drift that only runs on desktop pointers with motion allowed.
const BlurCircle = ({
  top = "auto",
  left = "auto",
  right = "auto",
  bottom = "auto",
  delay = "0s"
}) => {
  return (

    <div
      className="blur-circle animate-float-blob"
      aria-hidden="true"
      style={{
        top: top,
        left: left,
        right: right,
        bottom: bottom,
        animationDelay: delay
      }}
    >
    </div>
  )
}

export default React.memo(BlurCircle)
