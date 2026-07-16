export const fetchProfiles = async (api, { signal } = {}) => {
  const { data } = await api.get('/api/user/profiles', { signal });
  return Array.isArray(data?.profiles) ? data.profiles : [];
};

export const createProfile = async (api, input) => {
  const { data } = await api.post('/api/user/profiles', input);
  return data;
};

export const updateProfile = async (api, profileId, input) => {
  const { data } = await api.patch(`/api/user/profiles/${encodeURIComponent(profileId)}`, input);
  return data;
};

export const deleteProfile = async (api, profileId) => {
  const { data } = await api.delete(`/api/user/profiles/${encodeURIComponent(profileId)}`);
  return data;
};

