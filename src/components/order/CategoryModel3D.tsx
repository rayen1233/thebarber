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

function LuxuryPlaceholder() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const m = ref.current;
    if (!m) return;
    const t = clock.elapsedTime;
    m.rotation.y = t * 0.09;
    m.rotation.x = Math.sin(t * 0.2) * 0.06;
  });
  return (
    <mesh ref={ref}>
      <torusKnotGeometry args={[0.32, 0.08, 64, 12]} />
      <meshStandardMaterial
        color="#1a1510"
        metalness={0.74}
        roughness={0.3}
        envMapIntensity={0.5}
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
      const cap = hovered ? 0.55 : 0.75;
      const step = Math.min(dt * cap, spinLeft.current);
      grp.rotation.y += step;
      spinLeft.current -= step;
    } else {
      grp.rotation.y += dt * (hovered ? 0.04 : 0.055);
    }

    grp.rotation.x = THREE.MathUtils.lerp(
      grp.rotation.x,
      Math.sin(t * 0.48) * (hovered ? 0.05 : 0.03),
      0.05,
    );
    grp.rotation.z = THREE.MathUtils.lerp(
      grp.rotation.z,
      Math.cos(t * 0.4) * (hovered ? 0.04 : 0.022),
      0.05,
    );

    const targetScale = hovered ? 1.08 : 1;
    grp.scale.lerp(
      new THREE.Vector3(targetScale, targetScale, targetScale),
      hovered ? 0.07 : 0.035,
    );

    grp.position.y = THREE.MathUtils.lerp(
      grp.position.y,
      Math.sin(t * 0.82) * (hovered ? 0.03 : 0.02),
      0.07,
    );
  });

  return <group ref={g}>{children}</group>;
}

function RigLights({ hovered }: { hovered: boolean }) {
  const key = useRef<THREE.PointLight>(null);
  const rim = useRef<THREE.SpotLight>(null);
  const goldFill = useRef<THREE.PointLight>(null);

  useFrame((_, dt) => {
    const k = key.current;
    const r = rim.current;
    const g = goldFill.current;
    if (k) {
      k.intensity = THREE.MathUtils.damp(
        k.intensity,
        hovered ? 0.62 : 0.24,
        2.8,
        dt,
      );
    }
    if (r) {
      r.intensity = THREE.MathUtils.damp(
        r.intensity,
        hovered ? 0.38 : 0.14,
        2.8,
        dt,
      );
    }
    if (g) {
      g.intensity = THREE.MathUtils.damp(
        g.intensity,
        hovered ? 0.42 : 0.08,
        3.2,
        dt,
      );
    }
  });

  return (
    <>
      <ambientLight intensity={0.38} color="#9a8e84" />
      <hemisphereLight args={["#f0e6dc", "#1c1612", 0.45]} position={[0, 2.2, 0]} />
      <directionalLight
        position={[3.4, 5.2, 4.2]}
        intensity={0.55}
        color="#ece2d4"
      />
      <pointLight
        ref={key}
        position={[1.8, 1.4, 2.4]}
        color="#d4b060"
        distance={14}
      />
      <pointLight
        ref={goldFill}
        position={[0.15, 0.55, 1.95]}
        color="#f0d080"
        distance={5.5}
        decay={2}
      />
      <spotLight
        ref={rim}
        position={[-2.8, 3.8, 1.8]}
        angle={0.5}
        penumbra={0.95}
        color="#fff6e0"
        distance={11}
      />
    </>
  );
}

function ExposureSync({ hovered }: { hovered: boolean }) {
  const { gl } = useThree();
  useEffect(() => {
    gl.toneMappingExposure = hovered ? 1.18 : 1.02;
  }, [gl, hovered]);
  return null;
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
    camera.position.set(0, 0.12, 2.28);
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
          <Float speed={0.9} rotationIntensity={0.06} floatIntensity={0.12}>
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
      <RigLights hovered={hovered} />
      {wrapped}
    </>
  );
}

export type CategoryModel3DProps = {
  modelUrl: string | null;
  modelScale: number;
  hovered: boolean;
  quality: "high" | "low";
  className?: string;
};

export function CategoryModel3D({
  modelUrl,
  modelScale,
  hovered,
  quality,
  className = "",
}: CategoryModel3DProps) {
  const dpr: [number, number] =
    quality === "high" ? [1, 2] : [1, 1.2];

  return (
    <div
      className={`pointer-events-none relative h-full min-h-[140px] w-full max-w-[min(92%,22rem)] ${className}`.trim()}
    >
      <Canvas
        dpr={dpr}
        gl={{
          antialias: quality === "high",
          alpha: true,
          powerPreference: "high-performance",
        }}
        onCreated={({ gl }) => {
          gl.setClearColor(0x000000, 0);
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.02;
        }}
        camera={{ fov: 36, near: 0.08, far: 40 }}
      >
        <Scene
          modelUrl={modelUrl}
          modelScale={modelScale}
          hovered={hovered}
          quality={quality}
        />
        <ExposureSync hovered={hovered} />
      </Canvas>
    </div>
  );
}
