import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, type ReactNode } from "react";
import { Center, Float, useFBX, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";

function matLum(c: THREE.Color) {
  return 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
}

/** FBX/GLB imports often use near-black albedo — looks invisible under mood lighting. */
function enhanceImportedModelVisibility(root: THREE.Object3D) {
  const warm = new THREE.Color(0x9a8c7e);
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh) || !obj.material) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const m of mats) {
      if (!m || !("color" in m) || !m.color) continue;
      if (matLum(m.color as THREE.Color) < 0.08) {
        m.color.copy(warm);
        if ("emissive" in m && m.emissive) {
          m.emissive.setHex(0x2a2218);
          if (typeof m.emissiveIntensity === "number") {
            m.emissiveIntensity = Math.max(m.emissiveIntensity, 0.16);
          }
        }
      }
      if ("roughness" in m && typeof m.roughness === "number") {
        m.roughness = THREE.MathUtils.clamp(m.roughness, 0.25, 0.82);
      }
      if ("metalness" in m && typeof m.metalness === "number") {
        m.metalness = THREE.MathUtils.clamp(m.metalness, 0.12, 0.72);
      }
      if ("side" in m) {
        m.side = THREE.DoubleSide;
      }
      m.needsUpdate = true;
    }
  });
}

const GOLD = "#c9a227";
const WARM = "#d4c4a8";

function LuxuryPlaceholder() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const m = ref.current;
    if (!m) return;
    const t = clock.elapsedTime;
    m.rotation.y = t * 0.11;
    m.rotation.x = Math.sin(t * 0.22) * 0.08;
  });
  return (
    <mesh ref={ref} castShadow receiveShadow>
      <torusKnotGeometry args={[0.34, 0.085, 64, 12]} />
      <meshStandardMaterial
        color="#1a1510"
        metalness={0.72}
        roughness={0.32}
        envMapIntensity={0.45}
      />
    </mesh>
  );
}

function GlbModel({ url, scale }: { url: string; scale: number }) {
  const { scene } = useGLTF(url);
  const clone = useMemo(() => {
    const s = scene.clone(true);
    enhanceImportedModelVisibility(s);
    return s;
  }, [scene]);
  return <primitive object={clone} scale={scale} />;
}

function FbxModel({ url, scale }: { url: string; scale: number }) {
  const root = useFBX(url);
  const scene = useMemo(() => {
    const s = root.clone(true);
    enhanceImportedModelVisibility(s);
    return s;
  }, [root]);
  return <primitive object={scene} scale={scale} />;
}

function ObjModel({ url, scale }: { url: string; scale: number }) {
  const root = useLoader(OBJLoader, url);
  const scene = useMemo(() => {
    const s = root.clone(true);
    enhanceImportedModelVisibility(s);
    return s;
  }, [root]);
  return <primitive object={scene} scale={scale} />;
}

function FileModel({ url, scale }: { url: string; scale: number }) {
  const ext = url.split(".").pop()?.toLowerCase();
  if (ext === "glb" || ext === "gltf") return <GlbModel url={url} scale={scale} />;
  if (ext === "fbx") return <FbxModel url={url} scale={scale} />;
  if (ext === "obj") return <ObjModel url={url} scale={scale} />;
  return <LuxuryPlaceholder />;
}

function SpinRig({
  children,
  hovered,
}: {
  children: ReactNode;
  hovered: boolean;
}) {
  const g = useRef<THREE.Group>(null);
  const spinLeft = useRef(0);
  const prevHover = useRef(false);

  useEffect(() => {
    if (hovered && !prevHover.current) {
      spinLeft.current += Math.PI * 2;
    }
    prevHover.current = hovered;
  }, [hovered]);

  useFrame((state, dt) => {
    const grp = g.current;
    if (!grp) return;
    const t = state.clock.elapsedTime;

    if (spinLeft.current > 0) {
      const step = Math.min(dt * 0.95, spinLeft.current);
      grp.rotation.y += step;
      spinLeft.current -= step;
    } else {
      grp.rotation.y += dt * (hovered ? 0.05 : 0.07);
    }

    grp.rotation.x = THREE.MathUtils.lerp(
      grp.rotation.x,
      Math.sin(t * 0.5) * (hovered ? 0.06 : 0.035),
      0.04,
    );
    grp.rotation.z = THREE.MathUtils.lerp(
      grp.rotation.z,
      Math.cos(t * 0.42) * (hovered ? 0.05 : 0.028),
      0.04,
    );

    const targetScale = hovered ? 1.06 : 1;
    grp.scale.lerp(
      new THREE.Vector3(targetScale, targetScale, targetScale),
      hovered ? 0.06 : 0.04,
    );

    grp.position.y = THREE.MathUtils.lerp(
      grp.position.y,
      Math.sin(t * 0.85) * (hovered ? 0.028 : 0.018),
      0.06,
    );
  });

  return <group ref={g}>{children}</group>;
}

function RigLights({ hovered }: { hovered: boolean }) {
  const spot = useRef<THREE.SpotLight>(null);
  const fill = useRef<THREE.PointLight>(null);

  useFrame((_, dt) => {
    const s = spot.current;
    const f = fill.current;
    if (s) {
      s.intensity = THREE.MathUtils.damp(
        s.intensity,
        hovered ? 0.42 : 0.16,
        3.2,
        dt,
      );
    }
    if (f) {
      f.intensity = THREE.MathUtils.damp(
        f.intensity,
        hovered ? 0.55 : 0.22,
        3.2,
        dt,
      );
    }
  });

  return (
    <>
      <ambientLight intensity={0.32} color="#9a8a78" />
      <directionalLight
        castShadow
        position={[3.2, 5.5, 4]}
        intensity={0.52}
        color={WARM}
      />
      <spotLight
        ref={spot}
        position={[-2.8, 4.2, 2.4]}
        angle={0.42}
        penumbra={0.92}
        color="#e8d4a0"
        distance={12}
      />
      <pointLight ref={fill} position={[2, 1.2, 2.2]} color={GOLD} />
    </>
  );
}

function Scene({
  modelUrl,
  modelScale,
  hovered,
  quality,
}: {
  modelUrl: string | null;
  modelScale: number;
  hovered: boolean;
  quality: "high" | "low";
}) {
  const { camera } = useThree();
  useEffect(() => {
    camera.position.set(0, 0.15, 2.35);
    camera.lookAt(0, 0, 0);
  }, [camera]);

  const inner = modelUrl ? (
    <Suspense fallback={<LuxuryPlaceholder />}>
      <FileModel url={modelUrl} scale={modelScale} />
    </Suspense>
  ) : (
    <LuxuryPlaceholder />
  );

  const wrapped = (
    <Center>
      <SpinRig hovered={hovered}>
        {quality === "high" && !hovered ? (
          <Float speed={1.1} rotationIntensity={0.08} floatIntensity={0.14}>
            {inner}
          </Float>
        ) : (
          inner
        )}
      </SpinRig>
    </Center>
  );

  return (
    <>
      <color attach="background" args={["#000000"]} />
      <fog attach="fog" args={["#050403", 4.5, 9]} />
      <RigLights hovered={hovered} />
      {wrapped}
    </>
  );
}

export type ModelViewer3DProps = {
  modelUrl: string | null;
  modelScale: number;
  hovered: boolean;
  quality: "high" | "low";
  className?: string;
};

/**
 * Small luxury product stage — soft gold light, restrained motion.
 */
export function ModelViewer3D({
  modelUrl,
  modelScale,
  hovered,
  quality,
  className = "",
}: ModelViewer3DProps) {
  const dpr: [number, number] =
    quality === "high" ? [1, 2] : [1, 1.25];

  return (
    <div className={`relative h-full w-full min-h-[120px] ${className}`.trim()}>
      <Canvas
        shadows
        dpr={dpr}
        gl={{
          antialias: quality === "high",
          alpha: true,
          powerPreference: "high-performance",
        }}
        onCreated={({ gl }) => {
          gl.setClearColor(0x000000, 0);
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = quality === "high" ? 1.05 : 0.92;
        }}
        camera={{ fov: 38, near: 0.08, far: 40 }}
      >
        <Scene
          modelUrl={modelUrl}
          modelScale={modelScale}
          hovered={hovered}
          quality={quality}
        />
      </Canvas>
    </div>
  );
}
