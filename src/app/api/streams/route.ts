import { NextResponse } from 'next/server';

export const revalidate = 60;

const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;

type TwitchTokenResponse = {
  access_token: string;
  expires_in: number;
};

type TwitchGame = {
  id: string;
  name: string;
};

type TwitchGamesResponse = {
  data: TwitchGame[];
};

type TwitchStream = {
  id: string;
  user_id: string;
  user_login: string;
  user_name: string;
  title: string;
  viewer_count: number;
  thumbnail_url: string;
  type: string;
  started_at: string;
};

type TwitchStreamsResponse = {
  data: TwitchStream[];
  pagination?: { cursor?: string };
};

type TwitchUser = {
  id: string;
  profile_image_url: string;
};

type TwitchUsersResponse = {
  data: TwitchUser[];
};

let cachedToken = '';
let tokenExpiresAt = 0;

async function getTwitchToken() {
  if (cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken;
  }

  const response = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`,
    { method: 'POST' }
  );

  if (!response.ok) {
    throw new Error('Failed to fetch Twitch token');
  }

  const data = (await response.json()) as TwitchTokenResponse;
  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + (data.expires_in - 300) * 1000;
  return cachedToken;
}

const KEIZAAL_TERMS = [
  'keizaal', 'keizaal rp', 'keizaal roleplay', 'keizaalrp', 'keizaalroleplay',
  'keizaal-rp', 'keizaal-roleplay', '#keizaal', '#keizaalrp', '!keizaal',
  '!keizaalrp', 'keizaal_rp', 'keizaal_roleplay', 'keizaal.live',
  'skyrim rp', 'skyrim roleplay', 'skyrimrp', 'skyrimroleplay',
  'skyrim-rp', 'skyrim-roleplay', '#skyrimrp', '!skyrimrp',
  'skyrim_rp', 'skyrim_roleplay'
];

function isKeizaalStream(title: string) {
  const lowerTitle = title.toLowerCase();
  return KEIZAAL_TERMS.some(term => lowerTitle.includes(term));
}

const TWITCH_GAME_CANDIDATES: { name: string; fallbackId?: string }[] = [
  { name: 'The Elder Scrolls V: Skyrim', fallbackId: '18846' },
  { name: 'The Elder Scrolls V: Skyrim - Special Edition' },
];

async function getGameIds(token: string) {
  const ids = new Set<string>();

  for (const candidate of TWITCH_GAME_CANDIDATES) {
    const gameRes = await fetch(`https://api.twitch.tv/helix/games?name=${encodeURIComponent(candidate.name)}`, {
      headers: {
        'Client-ID': TWITCH_CLIENT_ID!,
        'Authorization': `Bearer ${token}`,
      },
      next: { revalidate: 86400 },
    });

    if (gameRes.ok) {
      const gameData = (await gameRes.json()) as TwitchGamesResponse;
      const id = gameData?.data?.[0]?.id;
      if (typeof id === 'string' && id.length > 0) {
        ids.add(id);
        continue;
      }
    }

    if (candidate.fallbackId) {
      ids.add(candidate.fallbackId);
    }
  }

  return Array.from(ids);
}

export async function GET() {
  try {
    if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET) {
      throw new Error('Missing Twitch credentials');
    }

    const token = await getTwitchToken();

    const gameIds = await getGameIds(token);
    const streamsById = new Map<string, TwitchStream>();

    for (const gameId of gameIds) {
      let cursor = '';

      for (let i = 0; i < 5; i++) {
        const url = new URL('https://api.twitch.tv/helix/streams');
        url.searchParams.append('game_id', gameId);
        url.searchParams.append('first', '100');
        if (cursor) {
          url.searchParams.append('after', cursor);
        }

        const streamsRes = await fetch(url.toString(), {
          headers: {
            'Client-ID': TWITCH_CLIENT_ID,
            'Authorization': `Bearer ${token}`,
          },
          next: { revalidate: 60 },
        });

        if (!streamsRes.ok) break;

        const streamsData = (await streamsRes.json()) as TwitchStreamsResponse;
        const pageStreams = streamsData.data || [];
        for (const stream of pageStreams) {
          if (typeof stream?.id === 'string' && stream.id.length > 0) {
            streamsById.set(stream.id, stream);
          }
        }

        if (streamsData.pagination && streamsData.pagination.cursor) {
          cursor = streamsData.pagination.cursor;
        } else {
          break;
        }
      }
    }

    // Filter by Keizaal terms
    const keizaalStreams = Array.from(streamsById.values()).filter(stream => isKeizaalStream(stream.title));

    // Get user profile images
    const userIds = keizaalStreams.map(s => s.user_id);
    const profileImages: Record<string, string> = {};

    if (userIds.length > 0) {
      for (let i = 0; i < userIds.length; i += 100) {
        const chunk = userIds.slice(i, i + 100);
        const usersUrl = new URL('https://api.twitch.tv/helix/users');
        chunk.forEach(id => usersUrl.searchParams.append('id', id));
        
        const usersRes = await fetch(usersUrl.toString(), {
          headers: {
            'Client-ID': TWITCH_CLIENT_ID,
            'Authorization': `Bearer ${token}`
          },
          next: { revalidate: 3600 }
        });

        if (usersRes.ok) {
          const usersData = (await usersRes.json()) as TwitchUsersResponse;
          usersData.data.forEach((u) => {
            profileImages[u.id] = u.profile_image_url;
          });
        }
      }
    }

    const formattedStreams = keizaalStreams.map(stream => ({
      platform: 'twitch',
      channel: stream.user_login,
      displayName: stream.user_name,
      title: stream.title,
      viewerCount: stream.viewer_count,
      thumbnailUrl: stream.thumbnail_url.replace('{width}', '800').replace('{height}', '450'),
      profileImageUrl: profileImages[stream.user_id] || '',
      url: `https://twitch.tv/${stream.user_login}`,
      isLive: stream.type === 'live',
      startedAt: stream.started_at
    }));

    formattedStreams.sort((a, b) => b.viewerCount - a.viewerCount);

    const teeweeIndex = formattedStreams.findIndex(s => s.channel.toLowerCase() === 'its_teewee');
    if (teeweeIndex > 0) {
      const teewee = formattedStreams.splice(teeweeIndex, 1)[0];
      formattedStreams.splice(1, 0, teewee);
    }

    const totalViewers = formattedStreams.reduce((acc, s) => acc + s.viewerCount, 0);

    const generatedAt = new Date().toISOString();
    const response = NextResponse.json({
      generatedAt,
      stats: {
        liveStreams: formattedStreams.length,
        totalViewers,
      },
      streams: formattedStreams,
    });

    response.headers.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=30');
    response.headers.set('CDN-Cache-Control', 'public, s-maxage=60, stale-while-revalidate=30');
    response.headers.set('Vercel-CDN-Cache-Control', 'public, s-maxage=60, stale-while-revalidate=30');

    return response;

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const response = NextResponse.json({ error: message }, { status: 500 });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }
}
