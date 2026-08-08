import React, {
  Suspense,
  lazy,
  useEffect,
  useRef,
  useState,
} from 'react';
import HeroSection from '../components/HeroSection';
import { getHeroTrailerMode } from '../components/hero/heroTrailerMode';

const FeatureSection = lazy(() => import('../components/FeatureSection'));
const NativeTrailerSection = lazy(() => import('../components/NativeTrailerSection'));
import { HomeDataProvider } from '../context/HomeDataContext';

const SectionSkeleton = ({ trailer = false }) => (
  <div className="px-4 py-10 animate-pulse sm:px-6 md:px-16 lg:px-24 xl:px-40">
    <div className="mb-6 h-9 w-52 rounded bg-white/10" />
    {trailer ? (
      <div className="mx-auto min-h-[60vh] aspect-video w-full max-w-4xl rounded-xl bg-white/10" />
    ) : (
      <div className="grid grid-cols-2 gap-6 md:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="aspect-2/3 rounded-lg bg-white/10" />
        ))}
      </div>
    )}
  </div>
);

const DeferredSection = ({ children, fallback, anchorId }) => {
  const rootRef = useRef(null);
  const [visible, setVisible] = useState(
    () => typeof IntersectionObserver === 'undefined',
  );

  useEffect(() => {
    const root = rootRef.current;
    if (visible || !root || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      setVisible(true);
      observer.disconnect();
    }, { rootMargin: '160px 0px', threshold: 0.01 });
    observer.observe(root);
    return () => observer.disconnect();
  }, [visible]);

  return (
    <div ref={rootRef} id={anchorId}>
      {visible ? <Suspense fallback={fallback}>{children}</Suspense> : fallback}
    </div>
  );
};

const Home = () => {
  const [requestedTrailerMovie, setRequestedTrailerMovie] = useState(null);
  const trailerMode = getHeroTrailerMode();

  return (
    <HomeDataProvider trailerMode={trailerMode}>
      <HeroSection autoPreview onTrailerRequest={setRequestedTrailerMovie} />
      <DeferredSection fallback={<SectionSkeleton />}>
        <FeatureSection />
      </DeferredSection>
      <DeferredSection anchorId="trailers" fallback={<SectionSkeleton trailer />}>
        <NativeTrailerSection sectionId="home-trailer-section" featuredMovie={requestedTrailerMovie} />
      </DeferredSection>
    </HomeDataProvider>
  );
};

export default Home;
