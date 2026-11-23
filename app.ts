import express from 'express';
import { createApp } from './apps/api/src/express-app.js';

// Vercel detects Express backends by a direct framework import in the entrypoint.
void express;

export default createApp();
