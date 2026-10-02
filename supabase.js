// Supabase Real-time Multi-User Sync Module

let supabaseClient = null;
let realtimeSubscriptions = [];

async function initSupabaseRealtime() {
  const cfg = window.SUPABASE_CONFIG || {};
  if (!cfg.enabled || !cfg.url || !cfg.anonKey || !window.supabase) {
    console.info('Supabase not configured or available. Running in offline mode.');
    return null;
  }

  try {
    supabaseClient = window.supabase.createClient(cfg.url, cfg.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      realtime: { params: { eventsPerSecond: 10 } },
    });

    console.info('Supabase initialized. Ready for real-time sync.');
    return supabaseClient;
  } catch (error) {
    console.warn('Supabase init failed:', error);
    return null;
  }
}

function isSupabaseEnabled() {
  return supabaseClient !== null;
}

async function loadTicketsFromSupabase() {
  if (!supabaseClient) return null;

  try {
    const { data, error } = await supabaseClient
      .from(window.SUPABASE_TABLES.TICKETS)
      .select('*, ' + window.SUPABASE_TABLES.FEEDBACKS + '(*)')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.warn('Failed to load tickets from Supabase:', error);
    return null;
  }
}

async function loadProfilesFromSupabase() {
  if (!supabaseClient) return null;

  try {
    const { data, error } = await supabaseClient
      .from(window.SUPABASE_TABLES.PROFILES)
      .select('*');

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.warn('Failed to load profiles from Supabase:', error);
    return null;
  }
}

async function pushTicketToSupabase(ticket) {
  if (!supabaseClient) return false;

  try {
    const { error } = await supabaseClient
      .from(window.SUPABASE_TABLES.TICKETS)
      .upsert({
        id: ticket.id,
        no: ticket.no,
        title: ticket.title,
        desc: ticket.desc,
        category: ticket.category,
        priority: ticket.priority || 'NORMAL',
        target_party: ticket.targetParty || 'BOTH',
        status: ticket.status || 'OPEN',
        evidence: ticket.evidence || '',
        created_at: ticket.createdAt,
        created_by: ticket.createdBy,
        created_by_name: ticket.createdByName,
        part: ticket.part || null,
        eta: ticket.eta || null,
        closed_at: ticket.closedAt || null,
        closed_by: ticket.closedBy || null,
        closed_by_name: ticket.closedByName || null,
      });

    if (error) throw error;
    console.info('Ticket synced to Supabase:', ticket.no);
    return true;
  } catch (error) {
    console.warn('Failed to push ticket to Supabase:', error);
    return false;
  }
}

async function pushFeedbackToSupabase(ticketId, feedback) {
  if (!supabaseClient) return false;

  try {
    const { error } = await supabaseClient
      .from(window.SUPABASE_TABLES.FEEDBACKS)
      .insert({
        ticket_id: ticketId,
        message: feedback.message,
        evidence: feedback.evidence || '',
        by: feedback.by,
        by_name: feedback.byName,
        role: feedback.role,
        eta: feedback.eta || null,
        created_at: feedback.at,
      });

    if (error) throw error;
    console.info('Feedback synced to Supabase for ticket:', ticketId);
    return true;
  } catch (error) {
    console.warn('Failed to push feedback to Supabase:', error);
    return false;
  }
}

async function pushProfileToSupabase(user) {
  if (!supabaseClient) return false;

  try {
    const { error } = await supabaseClient
      .from(window.SUPABASE_TABLES.PROFILES)
      .upsert({
        username: user.u,
        name: user.name,
        email: user.email || '',
        role: user.role,
      });

    if (error) throw error;
    console.info('Profile synced to Supabase:', user.u);
    return true;
  } catch (error) {
    console.warn('Failed to push profile to Supabase:', error);
    return false;
  }
}

function subscribeToTicketsRealtime(onTicketChange) {
  if (!supabaseClient) return;

  console.info('Subscribing to tickets realtime updates...');

  const subscription = supabaseClient
    .channel('public:tickets')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: window.SUPABASE_TABLES.TICKETS },
      (payload) => {
        console.info('Ticket change detected:', payload);
        onTicketChange(payload);
      }
    )
    .subscribe((status) => {
      console.info('Realtime subscription status:', status);
    });

  realtimeSubscriptions.push(subscription);
  return subscription;
}

function subscribeToFeedbacksRealtime(ticketId, onFeedbackChange) {
  if (!supabaseClient) return;

  console.info(`Subscribing to feedbacks for ticket ${ticketId}...`);

  const subscription = supabaseClient
    .channel(`public:feedbacks:ticket_id=eq.${ticketId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: window.SUPABASE_TABLES.FEEDBACKS, filter: `ticket_id=eq.${ticketId}` },
      (payload) => {
        console.info('Feedback received:', payload);
        onFeedbackChange(payload);
      }
    )
    .subscribe((status) => {
      console.info('Feedback subscription status:', status);
    });

  realtimeSubscriptions.push(subscription);
  return subscription;
}

function unsubscribeFromRealtime() {
  realtimeSubscriptions.forEach((sub) => {
    supabaseClient.removeChannel(sub);
  });
  realtimeSubscriptions = [];
  console.info('Unsubscribed from all realtime channels.');
}

async function logActivityToSupabase(ticketId, action, actor, actorName, details) {
  if (!supabaseClient) return false;

  try {
    const { error } = await supabaseClient
      .from(window.SUPABASE_TABLES.ACTIVITY_LOG)
      .insert({
        ticket_id: ticketId,
        action,
        actor,
        actor_name: actorName,
        details,
      });

    if (error) throw error;
    return true;
  } catch (error) {
    console.warn('Failed to log activity to Supabase:', error);
    return false;
  }
}
