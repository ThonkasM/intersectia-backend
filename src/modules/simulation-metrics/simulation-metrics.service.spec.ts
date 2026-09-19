import { SimulationMetricsService } from './simulation-metrics.service';

describe('SimulationMetricsService.getNodeMetrics', () => {
  let prisma: { vehicleCrossing: { findMany: jest.Mock } };
  let service: SimulationMetricsService;

  beforeEach(() => {
    prisma = { vehicleCrossing: { findMany: jest.fn() } };
    service = new SimulationMetricsService(prisma as never);
  });

  it('computes throughput, p95, per-direction averages and fairness', async () => {
    prisma.vehicleCrossing.findMany.mockResolvedValue([
      { direction: 'N', waitSeconds: 1 },
      { direction: 'N', waitSeconds: 3 },
      { direction: 'E', waitSeconds: 5 },
      { direction: 'E', waitSeconds: 7 },
      { direction: 'E', waitSeconds: 9 },
    ]);

    const metrics = await service.getNodeMetrics(60);

    expect(metrics.totalCrossings).toBe(5);
    expect(metrics.throughputPerMinute).toBe(5);
    expect(metrics.avgWaitSeconds).toBe(5);
    expect(metrics.p95WaitSeconds).toBe(9);
    expect(metrics.byDirection.N).toEqual({ total: 2, avgWaitSeconds: 2 });
    expect(metrics.byDirection.E).toEqual({ total: 3, avgWaitSeconds: 7 });
    expect(metrics.byDirection.S).toEqual({ total: 0, avgWaitSeconds: null });
    expect(metrics.fairnessGapSeconds).toBe(5);
  });

  it('returns nulls when there are no crossings in the window', async () => {
    prisma.vehicleCrossing.findMany.mockResolvedValue([]);

    const metrics = await service.getNodeMetrics(30);

    expect(metrics.totalCrossings).toBe(0);
    expect(metrics.throughputPerMinute).toBe(0);
    expect(metrics.avgWaitSeconds).toBeNull();
    expect(metrics.p95WaitSeconds).toBeNull();
    expect(metrics.fairnessGapSeconds).toBeNull();
  });
});
