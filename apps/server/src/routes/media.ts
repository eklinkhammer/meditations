import { FastifyPluginAsync } from 'fastify';
import { db, ambientSounds, musicTracks, scriptTemplates } from '../db/index.js';

export const mediaRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /ambient-sounds - List ambient sounds
  fastify.get('/ambient-sounds', async () => {
    const sounds = await db.select().from(ambientSounds);
    return { data: sounds };
  });

  // GET /music-tracks - List music tracks
  fastify.get('/music-tracks', async () => {
    const tracks = await db.select().from(musicTracks);
    return { data: tracks };
  });

  // GET /script-templates - List script templates
  fastify.get('/script-templates', async () => {
    const templates = await db.select().from(scriptTemplates);
    return { data: templates };
  });
};
