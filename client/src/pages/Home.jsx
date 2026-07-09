import React, { Suspense, lazy, useEffect, useState } from 'react'
import HeroSection from '../components/HeroSection'
import useIntersectionObserver from '../hooks/useIntersectionObserver'

const FeatureSection = lazy(() => import('../components/FeatureSection'))
const TrailerSection = lazy(() => import('../components/TrailerSection'))

const DeferredSection = ({ children, minHeight = 'min-h-80', rootMargin = '500px 0px', forceVisible = false }) => {
  const { ref, isVisible } = useIntersectionObserver({ threshold: 0.01, rootMargin })
  const shouldRender = forceVisible || isVisible

  return (
    <div ref={ref} className={shouldRender ? undefined : minHeight}>
      {shouldRender && (
        <Suspense fallback={null}>
          {children}
        </Suspense>
      )}
    </div>
  )
}

const Home = () => {
  const [featuredTrailerMovie, setFeaturedTrailerMovie] = useState(null)
  const [forceTrailers, setForceTrailers] = useState(false)

  const handleWatchTrailer = (movie) => {
    setFeaturedTrailerMovie(movie)
    setForceTrailers(true)
  }

  useEffect(() => {
    if (!forceTrailers) return
    let timeoutId
    let attempts = 0
    const scrollToTrailers = () => {
      const section = document.getElementById('home-trailers')
      if (section) {
        section.scrollIntoView({ behavior: 'smooth', block: 'start' })
        return
      }
      attempts += 1
      if (attempts < 12) timeoutId = window.setTimeout(scrollToTrailers, 80)
    }

    timeoutId = window.setTimeout(scrollToTrailers, 0)
    return () => window.clearTimeout(timeoutId)
  }, [forceTrailers, featuredTrailerMovie])

  return (
    <>
      <HeroSection onWatchTrailer={handleWatchTrailer}/>
      <DeferredSection minHeight="min-h-[640px]" rootMargin="700px 0px">
        <FeatureSection/>
      </DeferredSection>
      <DeferredSection minHeight="min-h-[480px]" rootMargin="500px 0px" forceVisible={forceTrailers}>
        <TrailerSection sectionId="home-trailers" featuredMovie={featuredTrailerMovie}/>
      </DeferredSection>
    </>
  )
}

export default Home
