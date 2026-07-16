import React from 'react';
import { PROFILE_AVATARS } from './profileAvatars';

const ProfileAvatar = ({ avatarId = PROFILE_AVATARS[0], name = '', className = '' }) => (
  <span className={`mobile-profile-avatar mobile-profile-avatar--${PROFILE_AVATARS.includes(avatarId) ? avatarId : PROFILE_AVATARS[0]} ${className}`}>
    <span aria-hidden="true">{String(name || 'N').trim().slice(0, 1).toUpperCase()}</span>
  </span>
);

export default React.memo(ProfileAvatar);
