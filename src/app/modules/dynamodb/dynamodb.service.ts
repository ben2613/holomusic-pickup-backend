import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  DeleteCommand,
  QueryCommand,
  ScanCommand,
  BatchWriteCommand,
  BatchWriteCommandInput,
  ScanCommandInput,
  QueryCommandInput,
} from '@aws-sdk/lib-dynamodb';
import { AppConfig } from '../../config/configuration';

@Injectable()
export class DynamoDBService {
  private readonly logger = new Logger(DynamoDBService.name);
  private readonly docClient: DynamoDBDocumentClient;

  constructor(private readonly configService: ConfigService<AppConfig, true>) {
    const dynamoConfig = this.configService.get('dynamodb', { infer: true });

    const client = new DynamoDBClient({
      endpoint: dynamoConfig.endpoint,
      region: dynamoConfig.region,
    });

    this.docClient = DynamoDBDocumentClient.from(client);
  }

  async get<T = Record<string, any>>(
    tableName: string,
    key: Record<string, any>,
  ): Promise<T | null> {
    const command = new GetCommand({
      TableName: tableName,
      Key: key,
    });

    const response = await this.docClient.send(command);
    return (response.Item as T) || null;
  }

  async put(
    tableName: string,
    item: Record<string, any>,
  ): Promise<void> {
    const command = new PutCommand({
      TableName: tableName,
      Item: item,
    });

    await this.docClient.send(command);
  }

  async delete(
    tableName: string,
    key: Record<string, any>,
  ): Promise<void> {
    const command = new DeleteCommand({
      TableName: tableName,
      Key: key,
    });

    await this.docClient.send(command);
  }

  async query<T = Record<string, any>>(
    tableName: string,
    keyConditionExpression: string,
    expressionAttributeValues: Record<string, any>,
    expressionAttributeNames?: Record<string, string>,
  ): Promise<T[]> {
    const items: T[] = [];
    let lastEvaluatedKey: Record<string, any> | undefined;

    do {
      const params: QueryCommandInput = {
        TableName: tableName,
        KeyConditionExpression: keyConditionExpression,
        ExpressionAttributeValues: expressionAttributeValues,
        ExpressionAttributeNames: expressionAttributeNames,
        ExclusiveStartKey: lastEvaluatedKey,
      };

      const command = new QueryCommand(params);
      const response = await this.docClient.send(command);
      
      if (response.Items) {
        items.push(...(response.Items as T[]));
      }
      
      lastEvaluatedKey = response.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    return items;
  }

  async scan<T = Record<string, any>>(
    tableName: string,
    filterExpression?: string,
    expressionAttributeValues?: Record<string, any>,
    expressionAttributeNames?: Record<string, string>,
    immediateReturn: boolean = false,
  ): Promise<T[]> {
    const items: T[] = [];
    let lastEvaluatedKey: Record<string, any> | undefined;

    do {
      const params: ScanCommandInput = {
        TableName: tableName,
        FilterExpression: filterExpression,
        ExpressionAttributeValues: expressionAttributeValues,
        ExpressionAttributeNames: expressionAttributeNames,
        ExclusiveStartKey: lastEvaluatedKey,
      };

      const command = new ScanCommand(params);
      const response = await this.docClient.send(command);
      
      if (response.Items) {
        items.push(...(response.Items as T[]));
      }
      
      lastEvaluatedKey = response.LastEvaluatedKey;
      
      // Return after first scan if immediateReturn is true
      if (immediateReturn) {
        break;
      }
    } while (lastEvaluatedKey);

    return items;
  }

  async batchWrite(
    tableName: string, 
    writeRequests: Array<{ 
      DeleteRequest?: { Key: Record<string, any> },
      PutRequest?: { Item: Record<string, any> }
    }>
  ): Promise<void> {
    const params: BatchWriteCommandInput = {
      RequestItems: {
        [tableName]: writeRequests
      }
    };

    await this.docClient.send(new BatchWriteCommand(params));
  }

  
  async purgeTable(tableName: string, excludeKeys: string[] = []): Promise<void> {
    try {
      this.logger.debug('Purging hololive_songs table...');
      const allSongs = await this.scan<{ id: string }>(tableName);
      
      if (allSongs.length === 0) {
        this.logger.debug('Table is already empty');
        return;
      }

      const songsToDelete = allSongs.filter(song => !excludeKeys.includes(song.id));
      // Delete songs in batches of 25 (DynamoDB BatchWriteItem limit)
      const batchSize = 25;
      for (let i = 0; i < songsToDelete.length; i += batchSize) {
        const batch = songsToDelete.slice(i, i + batchSize);
        const deleteRequests = batch.map(song => ({
          DeleteRequest: {
            Key: { id: song.id }
          }
        }));

        await this.batchWrite(tableName, deleteRequests);
        this.logger.debug(`Deleted batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(songsToDelete.length / batchSize)}`);
      }

      this.logger.log(`Purged ${songsToDelete.length} songs from the table`);
    } catch (error) {
      this.logger.error('Error purging table:', error);
      throw error;
    }
  }
} 