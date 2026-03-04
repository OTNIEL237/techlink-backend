const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const createMission = async (data) => {
  const { data: mission, error } = await supabase
    .from('missions')
    .insert({
      client_id: data.client_id,
      problem_description: data.problem_description,
      problem_photos: data.problem_photos || [],
      urgency_level: data.urgency_level || 'normal',
      ai_solution: data.ai_solution,
      ai_category_detected: data.ai_category_detected,
      client_address: data.client_address,
      client_lat: data.client_lat,
      client_lng: data.client_lng,
      status: 'pending',
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return mission;
};

const getClientMissions = async (clientId) => {
  const { data, error } = await supabase
    .from('missions')
    .select(`*, categories(name, slug)`)
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data;
};

const getMissionById = async (missionId) => {
  const { data, error } = await supabase
    .from('missions')
    .select(`*, categories(name, slug)`)
    .eq('id', missionId)
    .single();

  if (error) throw new Error(error.message);
  return data;
};

const updateMissionStatus = async (missionId, status) => {
  const { data, error } = await supabase
    .from('missions')
    .update({ status })
    .eq('id', missionId)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
};

module.exports = { createMission, getClientMissions, getMissionById, updateMissionStatus };