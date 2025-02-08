/** Import required dependencies */
const path = require('path');
const slsw = require('serverless-webpack');
const nodeExternals = require('webpack-node-externals');
const webpack = require('webpack');

module.exports = {
  /** Use serverless webpack lib to identify the entry points */
  entry: slsw.lib.entries,
  
  /** Set target to node since we're building a server-side application */
  target: 'node',
  
  /** Use development mode for local and production for deployment */
  mode: slsw.lib.webpack.isLocal ? 'development' : 'production',
  
  /** Disable minification for better debugging */
  optimization: {
    minimize: false,
    nodeEnv: false,
  },
  
  /** Disable performance hints as they're not relevant for server-side code */
  performance: {
    hints: false,
  },
  
  /** Enable source maps for debugging */
  devtool: 'source-map',
  
  /** Configure which modules should be excluded from the bundle */
  externals: [nodeExternals({
    allowlist: ['express']
  })],

  /** Ignore warnings that aren't critical dependency warnings */
  ignoreWarnings: [/^(?!CriticalDependenciesWarning$)/],
  
  /** Configure how different file types should be processed */
  module: {
    rules: [
      {
        test: /\.ts$/,  /** Process all TypeScript files */
        exclude: /node_modules/,  /** Don't process node_modules */
        use: [
          {
            loader: 'ts-loader',  /** Use ts-loader to compile TypeScript */
            options: {
              transpileOnly: true,  /** Only transpile, skip type checking for faster builds */
            },
          },
        ],
      },
    ],
  },
  
  /** Configure how modules are resolved */
  resolve: {
    extensions: ['.ts', '.js'],  /** Allow importing both TypeScript and JavaScript files without extensions */
    alias: {
      '@app': path.resolve(__dirname, './src/app/'),  /** Enable @app alias for cleaner imports */
    },
  },

  /** Configure webpack plugins */
  plugins: [
    /** Ignore lazy-loaded NestJS modules that we don't use */
    new webpack.IgnorePlugin({
      /**
       * Check if the resource should be ignored
       * Returns true if the resource should be ignored
       */
      checkResource(resource) {
        const lazyImports = [
          '@nestjs/microservices',
          '@nestjs/microservices/microservices-module',
          '@nestjs/websockets/socket-module',
          'class-validator',
          'class-transformer',
          'class-transformer/storage',
        ];
        
        if (!lazyImports.includes(resource)) {
          return false;
        }
        
        try {
          require.resolve(resource, {
            paths: [process.cwd()],
          });
        } catch (err) {
          return true;
        }
        return false;
      },
    }),
  ],
};
