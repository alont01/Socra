// Default Metro config for Expo (required so expo-router resolves correctly).
const { getDefaultConfig } = require('expo/metro-config')

const config = getDefaultConfig(__dirname)

module.exports = config
