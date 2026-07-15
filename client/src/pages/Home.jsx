import React, { Suspense, lazy, useEffect, useState } from 'react'
import HeroSection from '../components/HeroSection'

const FeatureSection = lazy(() => import('../components/FeatureSection'))
const TrailerSection = lazy(() => import('../components/TrailerSection'))

const HeroSkeleton = () => (
  <div className="w-full min-h-[70vh] sm:min-h-screen bg-black/60 animate-pulse flex flex-col justify-end p-8 sm:p-24 space-y-4">
    <div className="h-4 w-1/4 bg-white/10 rounded" />
    <div className="h-12 w-2/3 bg-white/10 rounded" />
    <div className="h-6 w-1/2 bg-white/10 rounded" />
    <div className="flex gap-4">
      <div className="h-12 w-32 bg-white/10 rounded-full" />
      <div className="h-12 w-32 bg-white/10 rounded-full" />
    </div>
  </div>
)

const FeatureSkeleton = () => (
  <div className="px-4 sm:px-6 md:px-16 lg:px-24 xl:px-40 py-10 animate-pulse space-y-6">
    <div className="flex justify-between items-center">
      <div className="h-10 w-48 bg-white/10 rounded" />
      <div className="h-10 w-24 bg-white/10 rounded-full" />
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="aspect-2/3 bg-white/10 rounded-lg" />
      ))}
    </div>
  </div>
)

const TrailerSkeleton = () => (
  <div className="px-4 sm:px-6 md:px-16 lg:px-24 xl:px-40 py-10 animate-pulse space-y-6">
    <div className="h-8 w-64 bg-white/10 rounded mx-auto" />
    <div className="w-full aspect-16/9 max-w-4xl mx-auto bg-white/10 rounded-xl" />
  </div>
)

const Home = () => {
  const [ready, setReady] = useState({ hero: false, feature: false, trailer: false })
  const [loadingPhase, setLoadingPhase] = useState(true)

  const allReady = ready.hero && ready.feature && ready.trailer

  useEffect(() => {
    if (allReady && loadingPhase) {
      setLoadingPhase(false)
    }
  }, [allReady, loadingPhase])

  useEffect(() => {
    const timer = setTimeout(() => {
      setLoadingPhase(false)
    }, 5000)
    return () => clearTimeout(timer)
  }, [])

  const handleLoaded = (section) => {
    setReady((prev) => ({ ...prev, [section]: true }))
  }

  const showHero = !loadingPhase || ready.hero
  const showFeature = !loadingPhase || ready.feature
  const showTrailer = !loadingPhase || ready.trailer

  return (
    <>
      <div className={showHero ? '' : 'hidden'}>
        <HeroSection autoPreview onDataLoaded={() => handleLoaded('hero')} />
      </div>
      {!showHero && <HeroSkeleton />}

      <Suspense fallback={null}>
        <div className={showFeature ? '' : 'hidden'}>
          <FeatureSection onDataLoaded={() => handleLoaded('feature')} />
        </div>
        {!showFeature && <FeatureSkeleton />}

        <div className={showTrailer ? '' : 'hidden'}>
          <TrailerSection onDataLoaded={() => handleLoaded('trailer')} />
        </div>
        {!showTrailer && <TrailerSkeleton />}
      </Suspense>
    </>
  )
}

export default Home
