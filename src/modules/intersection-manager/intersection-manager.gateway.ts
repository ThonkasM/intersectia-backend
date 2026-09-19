import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import {
  forwardRef,
  Inject,
  Logger,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { RemoteVehicleDto } from './dto/remote-vehicle.dto';
import { PlayerStateDto } from './dto/player-state.dto';
import {
  FreezeVehicleDto,
  SetCollisionsDto,
  SetModeDto,
} from './dto/control.dto';
import { DecisionEvent } from './decision/decision.interface';
import { SimulationLoopService } from './simulation-loop.service';

function allowedOrigins(): string[] | null {
  const raw = process.env.CORS_ORIGIN?.trim();
  if (!raw || raw === '*') return null;
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function corsOrigin(
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void,
): void {
  const allow = allowedOrigins();
  if (!allow || !origin || allow.includes(origin)) {
    callback(null, true);
    return;
  }
  callback(null, false);
}

function resolveSessionId(client: Socket): string {
  const raw =
    client.handshake.auth?.sessionId ?? client.handshake.query?.sessionId;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value === 'string') {
    const clean = value.trim();
    if (/^[A-Za-z0-9_-]{1,64}$/.test(clean)) return clean;
  }
  return client.id;
}

const WS_PIPE = new ValidationPipe({ whitelist: true, transform: true });

@WebSocketGateway({ cors: { origin: corsOrigin } })
export class IntersectionManagerGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(IntersectionManagerGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(
    @Inject(forwardRef(() => SimulationLoopService))
    private readonly simulationLoop: SimulationLoopService,
  ) {}

  handleConnection(client: Socket): void {
    const sessionId = resolveSessionId(client);
    client.data.sessionId = sessionId;
    void client.join(sessionId);
    this.simulationLoop.addClient(sessionId);
    this.logger.log(`Client ${client.id} joined session ${sessionId}`);
  }

  handleDisconnect(client: Socket): void {
    const sessionId = client.data.sessionId as string | undefined;
    if (sessionId) {
      this.simulationLoop.removeClient(sessionId);
      this.logger.log(`Client ${client.id} left session ${sessionId}`);
    }
  }

  broadcast(sessionId: string, vehicles: RemoteVehicleDto[]): void {
    this.server.to(sessionId).emit('state', vehicles);
  }

  emitDecision(sessionId: string, decision: DecisionEvent): void {
    this.server.to(sessionId).emit('decision', decision);
  }

  @UsePipes(WS_PIPE)
  @SubscribeMessage('setMode')
  handleSetMode(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: SetModeDto,
  ): void {
    this.simulationLoop.setMode(sessionIdOf(client), body.mode);
  }

  @UsePipes(WS_PIPE)
  @SubscribeMessage('playerState')
  handlePlayerState(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: PlayerStateDto,
  ): void {
    this.simulationLoop.upsertPlayerVehicle(sessionIdOf(client), body);
  }

  @UsePipes(WS_PIPE)
  @SubscribeMessage('freezeVehicle')
  handleFreezeVehicle(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: FreezeVehicleDto,
  ): void {
    this.simulationLoop.setFrozen(sessionIdOf(client), body.id, true);
  }

  @UsePipes(WS_PIPE)
  @SubscribeMessage('resumeVehicle')
  handleResumeVehicle(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: FreezeVehicleDto,
  ): void {
    this.simulationLoop.setFrozen(sessionIdOf(client), body.id, false);
  }

  @SubscribeMessage('reset')
  handleReset(@ConnectedSocket() client: Socket): void {
    this.simulationLoop.reset(sessionIdOf(client));
  }

  @UsePipes(WS_PIPE)
  @SubscribeMessage('setCollisions')
  handleSetCollisions(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: SetCollisionsDto,
  ): void {
    this.simulationLoop.setCollisions(sessionIdOf(client), body.enabled);
  }
}

function sessionIdOf(client: Socket): string {
  return (client.data.sessionId as string | undefined) ?? client.id;
}
