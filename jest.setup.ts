import '@testing-library/jest-dom'

// Polyfill Web APIs missing from jsdom
const { TextEncoder, TextDecoder } = require('util')
global.TextEncoder = TextEncoder
global.TextDecoder = TextDecoder

// The Anthropic SDK client is constructed at module load in lib/ai/client.ts
// and throws without a key. Tests never make real calls (trackedMessage is
// mocked), so a dummy key is enough to let those modules import.
process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'test-key'
