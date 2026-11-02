const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const repositoryRoot = path.resolve(__dirname, '../..');

config.watchFolders = [...config.watchFolders, repositoryRoot];
config.resolver.nodeModulesPaths = [path.join(__dirname, 'node_modules'), path.join(repositoryRoot, 'node_modules')];

module.exports = config;
