import '@testing-library/jest-dom'

// Polyfill Web APIs missing from jsdom
const { TextEncoder, TextDecoder } = require('util')
global.TextEncoder = TextEncoder
global.TextDecoder = TextDecoder
