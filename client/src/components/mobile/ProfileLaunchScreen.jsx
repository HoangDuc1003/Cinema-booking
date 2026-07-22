import React, { useEffect, useState } from 'react';
import ProfileAvatar from './ProfileAvatar';

const MIN_DURATION_MS = 450;
const MAX_DURATION_MS = 3000;

const ProfileLaunchScreen = ({ profile, criticalReady, onComplete }) => {
  const [minimumElapsed, setMinimumElapsed] = useState(false);

  useEffect(() => {
    const minimumTimer = window.setTimeout(() => setMinimumElapsed(true), MIN_DURATION_MS);
    const safetyTimer = window.setTimeout(onComplete, MAX_DURATION_MS);
    return () => {
      window.clearTimeout(minimumTimer);
      window.clearTimeout(safetyTimer);
    };
  }, [onComplete]);

  useEffect(() => {
    if (criticalReady && minimumElapsed) onComplete();
  }, [criticalReady, minimumElapsed, onComplete]);

  return (
    <main className="mobile-profile-launch" data-testid="profile-launch">
      <ProfileAvatar avatarId={profile?.avatarId} name={profile?.name} className="mobile-profile-launch__avatar" />
      <span className="mobile-launch-ring" aria-hidden="true" />
      <p role="status" aria-live="polite">Loading home</p>
    </main>
  );
};

export default ProfileLaunchScreen;
