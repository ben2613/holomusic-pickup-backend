import { Handler, Context, APIGatewayProxyEvent, EventBridgeEvent } from 'aws-lambda';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module';
import { TasksService } from './app/modules/tasks/tasks.service';
import { configure as serverlessExpress } from '@vendia/serverless-express';
import { ExpressAdapter } from '@nestjs/platform-express';
import { ConsoleLogger, Logger, LoggerService, LogLevel } from '@nestjs/common';
import { Server } from 'http';

// Use require for express to avoid webpack issues
const express = require('express');

let cachedServer: ReturnType<typeof serverlessExpress>;
let tasksService: TasksService;

// Custom logger for serverless environment
class ServerlessLogger extends ConsoleLogger {
  private static isServerlessOffline = process.env.IS_OFFLINE === 'true';

  constructor(context?: string) {
    super(context);
    this.setLogLevels(['error', 'warn', 'log', 'debug', 'verbose']);
  }

  protected getTimestamp(): string {
    return new Date().toISOString();
  }

  protected colorize(message: string, _logLevel: LogLevel): string {
    return message;
  }

  protected formatMessage(logLevel: LogLevel, message: string, pidMessage?: string, formattedContext?: string): string {
    const output = this.getTimestamp() + ` ${formattedContext || '-'} ${message}`;
    return this.colorize(output, logLevel);
  }

  log(message: string, ...args: any[]) {
    console.log(message, ...args);
    if (!ServerlessLogger.isServerlessOffline) {
      super.log(message, ...args);
    }
  }

  error(message: string, ...args: any[]) {
    console.error(message, ...args);
    if (!ServerlessLogger.isServerlessOffline) {
      super.error(message, ...args);
    }
  }

  warn(message: string, ...args: any[]) {
    console.warn(message, ...args);
    if (!ServerlessLogger.isServerlessOffline) {
      super.warn(message, ...args);
    }
  }

  debug(message: string, ...args: any[]) {
    console.debug(message, ...args);
    if (!ServerlessLogger.isServerlessOffline) {
      super.debug(message, ...args);
    }
  }

  verbose(message: string, ...args: any[]) {
    console.log(message, ...args);
    if (!ServerlessLogger.isServerlessOffline) {
      super.verbose(message, ...args);
    }
  }
}

// Utility function to wait for logger to flush
const waitForLogger = async () => {
  return new Promise<void>((resolve) => {
    // Wait a short time to allow logs to be written
    setTimeout(() => {
      // Force flush any remaining console logs
      console.log('[Logger] Flushing remaining logs...');
      resolve();
    }, 100);
  });
};

async function bootstrap() {
  if (!cachedServer) {
    const expressApp = express();
    const nestApp = await NestFactory.create(
      AppModule,
      new ExpressAdapter(expressApp),
    );
    
    await nestApp.init();
    cachedServer = serverlessExpress({ app: expressApp });
  }
  return cachedServer;
}

export const handler: Handler = async (
  event: APIGatewayProxyEvent | EventBridgeEvent<string, any>,
  context: Context,
) => {
  // Ensure we leave enough time for log flushing
  context.callbackWaitsForEmptyEventLoop = true;
  
  console.log('Event received:', JSON.stringify(event, null, 2));
  
  try {
    // Handle EventBridge scheduled task
    if ('source' in event && event.source === 'aws.events') {
      if (!tasksService) {
        const app = await NestFactory.create(AppModule, {
          logger: new ServerlessLogger('Bootstrap')
        });
        tasksService = app.get(TasksService);
      }
      
      try {
        // Execute the scheduled task based on the task name
        const taskName = event.detail?.task;
        
        switch (taskName) {
          case 'checkOAuthToken':
            await tasksService.checkOAuthToken();
            break;
          case 'fetchAndFilterSongs':
            await tasksService.fetchAndFilterSongs();
            break;
          default:
            throw new Error(`Unknown task: ${taskName}`);
        }

        // Wait for logs to flush before returning
        await waitForLogger();
        return {
          statusCode: 200,
          body: JSON.stringify({ 
            message: `Scheduled task ${taskName} completed successfully`,
            timestamp: new Date().toISOString()
          }),
        };
      } catch (error) {
        console.error(`Error executing scheduled task:`, error);
        // Wait for error logs to flush
        await waitForLogger();
        return {
          statusCode: 500,
          body: JSON.stringify({ 
            message: 'Error executing scheduled task',
            error: error.message 
          }),
        };
      }
    }
    
    // Handle API Gateway requests
    const server = await bootstrap();
    
    const response = await server(event, context);
    // Wait for any logs from the request to flush
    await waitForLogger();
    return response;
  } catch (error) {
    console.error('Unhandled error in lambda handler:', error);
    // Wait for error logs to flush
    await waitForLogger();
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Internal server error',
        error: error.message
      })
    };
  }
}; 