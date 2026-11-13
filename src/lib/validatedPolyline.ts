// ValidatedPolyline: Exact polyline distance-based interpolator for MARSWalk
//
// Replaces THREE.SplineCurve for planned routes.
// The route planner validates straight segments between its final points.
// This class guarantees that all ribbon vertices, guided movement positions,
// progress metrics, and off-route detection points remain strictly on the
// planner-validated line segments, eliminating any spline bulging into steep
// scarps or unmeasured terrain.

export interface PolylinePoint {
  x: number;
  z: number;
}

export interface PolylineSample {
  x: number;
  z: number;
  segmentIndex: number;
  segmentT: number; // 0..1 along that segment
  cumulativeDistance: number;
  tangent: { x: number; z: number }; // normalized horizontal unit vector
}

export interface ClosestPointResult {
  point: PolylinePoint;
  distance: number; // perpendicular or nearest distance to segment
  cumulativeDistance: number; // distance along polyline to this closest point
  segmentIndex: number;
  segmentT: number;
  tangent: { x: number; z: number };
}

export class ValidatedPolyline {
  readonly points: PolylinePoint[];
  readonly segmentLengths: number[];
  readonly cumulativeDistances: number[];
  readonly totalLength: number;

  constructor(rawPoints: PolylinePoint[]) {
    if (!rawPoints || rawPoints.length === 0) {
      this.points = [
        { x: 0, z: 0 },
        { x: 0, z: 10 },
      ];
    } else if (rawPoints.length === 1) {
      this.points = [
        { x: rawPoints[0].x, z: rawPoints[0].z },
        { x: rawPoints[0].x, z: rawPoints[0].z + 10 },
      ];
    } else {
      this.points = rawPoints.map((p) => ({ x: p.x, z: p.z }));
    }

    this.segmentLengths = [];
    this.cumulativeDistances = [0];
    let total = 0;

    for (let i = 0; i < this.points.length - 1; i++) {
      const p1 = this.points[i];
      const p2 = this.points[i + 1];
      const len = Math.hypot(p2.x - p1.x, p2.z - p1.z);
      this.segmentLengths.push(len);
      total += len;
      this.cumulativeDistances.push(total);
    }

    this.totalLength = Math.max(0.001, total);
  }

  /**
   * Sample the exact polyline at a given distance along the path.
   * Guarantees that the point lies STRICTLY on the line segment between points[i] and points[i+1].
   */
  getPointAtDistance(distance: number): PolylineSample {
    const d = Math.max(0, Math.min(this.totalLength, distance));
    const numSegments = this.segmentLengths.length;

    let segIdx = 0;
    while (segIdx < numSegments - 1 && this.cumulativeDistances[segIdx + 1] < d) {
      segIdx++;
    }

    const segStartDist = this.cumulativeDistances[segIdx];
    const segLen = this.segmentLengths[segIdx];
    const segT = segLen > 0.0001 ? Math.max(0, Math.min(1, (d - segStartDist) / segLen)) : 0;

    const p1 = this.points[segIdx];
    const p2 = this.points[segIdx + 1];

    const x = p1.x + segT * (p2.x - p1.x);
    const z = p1.z + segT * (p2.z - p1.z);

    const tanLen = segLen || 1;
    const tangent = {
      x: (p2.x - p1.x) / tanLen,
      z: (p2.z - p1.z) / tanLen,
    };

    return {
      x,
      z,
      segmentIndex: segIdx,
      segmentT: segT,
      cumulativeDistance: d,
      tangent,
    };
  }

  /**
   * Sample the exact polyline at ratio t (0..1).
   */
  getPointAtRatio(t: number): PolylineSample {
    return this.getPointAtDistance(Math.max(0, Math.min(1, t)) * this.totalLength);
  }

  /**
   * Find the closest point on the exact polyline segments to (px, pz).
   * Does NOT smooth or round corners.
   */
  findClosestPoint(px: number, pz: number): ClosestPointResult {
    let bestDistSq = Infinity;
    let bestResult: ClosestPointResult = {
      point: { x: this.points[0].x, z: this.points[0].z },
      distance: 0,
      cumulativeDistance: 0,
      segmentIndex: 0,
      segmentT: 0,
      tangent: { x: 0, z: -1 },
    };

    for (let i = 0; i < this.points.length - 1; i++) {
      const a = this.points[i];
      const b = this.points[i + 1];
      const abx = b.x - a.x;
      const abz = b.z - a.z;
      const lenSq = abx * abx + abz * abz;

      let t = 0;
      if (lenSq > 0.000001) {
        t = Math.max(0, Math.min(1, ((px - a.x) * abx + (pz - a.z) * abz) / lenSq));
      }

      const qx = a.x + t * abx;
      const qz = a.z + t * abz;
      const distSq = (px - qx) ** 2 + (pz - qz) ** 2;

      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        const segLen = this.segmentLengths[i] || 1;
        bestResult = {
          point: { x: qx, z: qz },
          distance: Math.sqrt(distSq),
          cumulativeDistance: this.cumulativeDistances[i] + t * this.segmentLengths[i],
          segmentIndex: i,
          segmentT: t,
          tangent: {
            x: abx / segLen,
            z: abz / segLen,
          },
        };
      }
    }

    return bestResult;
  }

  /**
   * Calculate remaining distance along the exact polyline from (px, pz).
   * Measured from the nearest point on the polyline segments to the destination.
   */
  getRemainingDistanceAlongPolyline(px: number, pz: number): number {
    const closest = this.findClosestPoint(px, pz);
    return Math.max(0, this.totalLength - closest.cumulativeDistance);
  }

  /**
   * Generates ribbon sample points along the exact polyline segments.
   * Explicitly places sample vertices at every waypoint corner, plus uniform sub-samples
   * along straight segments to hug undulating terrain heights.
   * Guarantees 0.0 m lateral deviation from the validated segments!
   */
  generateRibbonSamples(maxStepMeters = 1.5): PolylineSample[] {
    const samples: PolylineSample[] = [];

    for (let i = 0; i < this.points.length - 1; i++) {
      const p1 = this.points[i];
      const p2 = this.points[i + 1];
      const segLen = this.segmentLengths[i];
      const segStartDist = this.cumulativeDistances[i];
      const numSub = Math.max(1, Math.ceil(segLen / maxStepMeters));

      const tanLen = segLen || 1;
      const tangent = {
        x: (p2.x - p1.x) / tanLen,
        z: (p2.z - p1.z) / tanLen,
      };

      for (let s = 0; s < numSub; s++) {
        const segT = s / numSub;
        samples.push({
          x: p1.x + segT * (p2.x - p1.x),
          z: p1.z + segT * (p2.z - p1.z),
          segmentIndex: i,
          segmentT: segT,
          cumulativeDistance: segStartDist + segT * segLen,
          tangent,
        });
      }
    }

    // Add final destination point
    const lastIdx = this.points.length - 1;
    const lastSegIdx = Math.max(0, lastIdx - 1);
    const lastSegLen = this.segmentLengths[lastSegIdx] || 1;
    const lastP = this.points[lastIdx];
    const prevP = this.points[lastSegIdx];
    samples.push({
      x: lastP.x,
      z: lastP.z,
      segmentIndex: lastSegIdx,
      segmentT: 1.0,
      cumulativeDistance: this.totalLength,
      tangent: {
        x: (lastP.x - prevP.x) / lastSegLen,
        z: (lastP.z - prevP.z) / lastSegLen,
      },
    });

    return samples;
  }
}
