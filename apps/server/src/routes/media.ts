import { FastifyPluginAsync } from 'fastify';
import { db, ambientSounds, musicTracks, scriptTemplates } from '../db/index.js';

export const mediaRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /ambient-sounds - List ambient sounds
  fastify.get('/ambient-sounds', async (request, reply) => {
    try {
      const sounds = await db.select().from(ambientSounds);
      return { data: sounds };
    } catch (err) {
      request.log.error(err, 'Failed to list ambient sounds');
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // GET /music-tracks - List music tracks
  fastify.get('/music-tracks', async (request, reply) => {
    try {
      const tracks = await db.select().from(musicTracks);
      return { data: tracks };
    } catch (err) {
      request.log.error(err, 'Failed to list music tracks');
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // GET /script-templates - List script templates
  fastify.get('/script-templates', async (request, reply) => {
    try {
      const templates = await db.select().from(scriptTemplates);
      return { data: templates };
    } catch (err) {
      request.log.error(err, 'Failed to list script templates');
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });
};
