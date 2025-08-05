module.exports = {
  presets: [
    [
      '@babel/preset-env',
      {
        targets: {
          node: 'current', // Target current Node.js version
        },
      },
    ],
  ],
  plugins: [
    'babel-plugin-transform-import-meta'
  ]
}; 