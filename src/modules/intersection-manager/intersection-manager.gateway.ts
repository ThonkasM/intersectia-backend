import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { forwardRef, Inject } from '@nestjs/common';
import { RemoteVehicleDto } from './dto/remote-vehicle.dto';
import { PlayerStateDto } from './dto/player-state.dto';
import { SimMode } from './decision/decision.interface';
import { SimulationLoopService } from './simulation-loop.service';

@WebSocketGateway({ cors: { origin: true } })
export class IntersectionManagerGateway {
  @WebSocketServer()
  server: Server;

  constructor(
    @Inject(forwardRef(() => SimulationLoopService))
    private readonly simulationLoop: SimulationLoopService,
  ) {}

  broadcast(vehicles: RemoteVehicleDto[]): void {
    this.server.emit('state', vehicles);
  }

  emitDecision(decision: {
    vehicleId: string;
    from: string;
    waitSeconds: number;
    engine: 'fifo' | 'right-priority' | 'ai';
    at: number;
  }): void {
    this.server.emit('decision', decision);
  }

  @SubscribeMessage('setMode')
  handleSetMode(
    @MessageBody() body: { mode: SimMode },
    @ConnectedSocket() client: Socket,
  ): void {
    void client;
    this.simulationLoop.setMode(body.mode);
  }

  @SubscribeMessage('playerState')
  handlePlayerState(@MessageBody() body: PlayerStateDto): void {
    this.simulationLoop.upsertPlayerVehicle(body);
  }
}
