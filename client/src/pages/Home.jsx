import React, { Suspense, lazy, useEffect, useState } from 'react'
import HeroSection from '../components/HeroSection'
import HomeBootLoader from '../components/HomeBootLoader'

const FeatureSection = lazy(() => import('../components/FeatureSection'))
const TrailerSection = lazy(() => import('../components/TrailerSection'))

const DEFAULT_HOME_TIMINGS = Object.freeze({
  loaderMs: 3_000,
  fadeMs: 450,
  // Small guard band keeps the visibly observed poster hold near two seconds
  // even when WebKit batches animation frames around the loader transition.
  posterWarmupMs: 2_200,
})

const normalizeTiming = (value, fallback) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? Math.min(parsed, 60_000) : fallback
}

const resolveHomeTimings = () => {
  const overrides = import.meta.env.DEV && typeof window !== 'undefined'
    ? window.__NITROCINE_HOME_TIMINGS__
    : null

  return {
    loaderMs: normalizeTiming(overrides?.loaderMs, DEFAULT_HOME_TIMINGS.loaderMs),
    fadeMs: normalizeTiming(overrides?.fadeMs, DEFAULT_HOME_TIMINGS.fadeMs),
    posterWarmupMs: normalizeTiming(overrides?.posterWarmupMs, DEFAULT_HOME_TIMINGS.posterWarmupMs),
  }
}

const Home = () => {
  const [timings] = useState(resolveHomeTimings)
  const [introPhase, setIntroPhase] = useState('visible')
  const introComplete = introPhase === 'complete'

  useEffect(() => {
    const fadeTimer = window.setTimeout(() => {
      setIntroPhase('exiting')
    }, timings.loaderMs)
    const completeTimer = window.setTimeout(() => {
      setIntroPhase('complete')
    }, timings.loaderMs + timings.fadeMs)

    return () => {
      window.clearTimeout(fadeTimer)
      window.clearTimeout(completeTimer)
    }
  }, [timings])

  useEffect(() => {
    if (introComplete) return undefined

    const root = document.documentElement
    const body = document.body
    const previousRootOverflow = root.style.overflow
    const previousBodyOverflow = body.style.overflow
    const previousBodyOverscroll = body.style.overscrollBehavior

    root.style.overflow = 'hidden'
    body.style.overflow = 'hidden'
    body.style.overscrollBehavior = 'none'

    return () => {
      root.style.overflow = previousRootOverflow
      body.style.overflow = previousBodyOverflow
      body.style.overscrollBehavior = previousBodyOverscroll
    }
  }, [introComplete])

  return (
    <>
      <div
        aria-busy={!introComplete}
        aria-hidden={!introComplete}
        inert={!introComplete ? true : undefined}
      >
        <HeroSection
          autoPreview
          introComplete={introComplete}
          posterWarmupMs={timings.posterWarmupMs}
        />
        <Suspense fallback={null}>
          <FeatureSection/>
          <TrailerSection/>
        </Suspense>
      </div>

      {!introComplete && (
        <HomeBootLoader
          exiting={introPhase === 'exiting'}
          fadeMs={timings.fadeMs}
        />
      )}
    </>
  )
}

export default Home
