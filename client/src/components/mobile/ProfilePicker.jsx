import React, { useEffect, useRef, useState } from 'react';
import { Pencil, Plus, Trash2, X } from 'lucide-react';
import { assets } from '../../assets/assets';
import { useProfiles } from '../../context/ProfileContext';
import ProfileAvatar from './ProfileAvatar';
import { PROFILE_AVATARS } from './profileAvatars';

const EMPTY_FORM = { name: '', avatarId: PROFILE_AVATARS[0], isKids: false };

const ProfileEditor = ({ profile, onClose }) => {
  const { createProfile, deleteProfile, profiles, updateProfile } = useProfiles();
  const [form, setForm] = useState(profile ? { ...profile } : EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const dialogRef = useRef(null);
  const nameRef = useRef(null);

  useEffect(() => {
    nameRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      )];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const input = { name: form.name, avatarId: form.avatarId, isKids: form.isKids === true };
      if (profile) await updateProfile(profile.id, input);
      else await createProfile(input);
      onClose();
    } catch {
      // The context exposes a sanitized message while the editor stays open.
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!profile || profiles.length <= 1) return;
    setSaving(true);
    try {
      await deleteProfile(profile.id);
      onClose();
    } catch {
      // The context exposes a sanitized message while the editor stays open.
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mobile-profile-dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div ref={dialogRef} className="mobile-profile-dialog" role="dialog" aria-modal="true" aria-labelledby="profile-editor-title">
        <button type="button" className="mobile-icon-button mobile-profile-dialog__close" onClick={onClose} aria-label="Close profile editor"><X /></button>
        <h2 id="profile-editor-title">{profile ? 'Edit profile' : 'Add profile'}</h2>
        <form onSubmit={submit}>
          <label htmlFor="mobile-profile-name">Profile name</label>
          <input
            ref={nameRef}
            id="mobile-profile-name"
            maxLength={20}
            minLength={1}
            required
            value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
          />
          <fieldset>
            <legend>Choose an avatar</legend>
            <div className="mobile-avatar-options">
              {PROFILE_AVATARS.map((avatarId) => (
                <button
                  type="button"
                  key={avatarId}
                  aria-label={`Choose avatar ${avatarId}`}
                  aria-pressed={form.avatarId === avatarId}
                  onClick={() => setForm((current) => ({ ...current, avatarId }))}
                >
                  <ProfileAvatar avatarId={avatarId} name={form.name} />
                </button>
              ))}
            </div>
          </fieldset>
          <label className="mobile-kids-toggle">
            <input type="checkbox" checked={form.isKids === true} onChange={(event) => setForm((current) => ({ ...current, isKids: event.target.checked }))} />
            Kids profile
          </label>
          <div className="mobile-profile-dialog__actions">
            {profile && profiles.length > 1 && (
              <button type="button" className="mobile-danger-button" onClick={remove} disabled={saving}><Trash2 /> Delete</button>
            )}
            <button type="submit" className="mobile-primary-button" disabled={saving}>{saving ? 'Saving…' : 'Save profile'}</button>
          </div>
        </form>
      </div>
    </div>
  );
};

const ProfilePicker = () => {
  const { error, profiles, selectProfile } = useProfiles();
  const [editMode, setEditMode] = useState(false);
  const [editingProfile, setEditingProfile] = useState(undefined);
  const editTriggerRef = useRef(null);
  const editorTriggerIdRef = useRef('');

  const openEditor = (profile) => {
    editorTriggerIdRef.current = profile?.id || 'add-profile';
    setEditingProfile(profile);
  };

  const closeEditor = () => {
    setEditingProfile(undefined);
    window.setTimeout(() => {
      const trigger = [...document.querySelectorAll('[data-profile-editor-trigger]')]
        .find((element) => element.dataset.profileEditorTrigger === editorTriggerIdRef.current);
      (trigger || editTriggerRef.current)?.focus();
    }, 0);
  };

  return (
    <main className="mobile-profile-picker" data-testid="profile-picker">
      <div className="mobile-profile-picker__glow" />
      <img src={assets.logo} alt="NitroCine" className="mobile-profile-picker__logo" />
      <div className="mobile-profile-picker__content">
        <h1>Choose your profile</h1>
        <p className="mobile-muted-copy">A personalized movie experience for every viewer.</p>
        {error && <p role="alert" className="mobile-error-copy">{error}</p>}
        <div className="mobile-profile-grid">
          {profiles.map((profile) => (
            <div className="mobile-profile-tile" key={profile.id}>
              <button
                type="button"
                data-profile-editor-trigger={profile.id}
                onClick={() => editMode ? openEditor(profile) : selectProfile(profile)}
                aria-label={`${editMode ? 'Edit' : 'Choose'} profile ${profile.name}`}
              >
                <ProfileAvatar avatarId={profile.avatarId} name={profile.name} />
                {editMode && <span className="mobile-profile-tile__edit" aria-hidden="true"><Pencil /></span>}
              </button>
              <span>{profile.name}</span>
            </div>
          ))}
          {editMode && profiles.length < 5 && (
            <div className="mobile-profile-tile">
              <button type="button" data-profile-editor-trigger="add-profile" onClick={() => openEditor(null)} aria-label="Add profile" className="mobile-profile-add"><Plus /></button>
              <span>Add profile</span>
            </div>
          )}
        </div>
        <button ref={editTriggerRef} type="button" className="mobile-secondary-button" onClick={() => setEditMode((current) => !current)}>
          <Pencil /> {editMode ? 'Done' : 'Manage profiles'}
        </button>
      </div>
      {editingProfile !== undefined && <ProfileEditor profile={editingProfile} onClose={closeEditor} />}
    </main>
  );
};

export default ProfilePicker;
