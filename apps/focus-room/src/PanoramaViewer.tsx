import { useEffect, useRef } from 'react'
import * as THREE from 'three'

interface PanoramaViewerProps {
  src: string
  yaw: number
  pitch: number
}

function PanoramaViewer({ src, yaw, pitch }: PanoramaViewerProps) {
  const mountRef = useRef<HTMLDivElement | null>(null)
  const yawRef = useRef(yaw)
  const pitchRef = useRef(pitch)

  useEffect(() => {
    yawRef.current = yaw
    pitchRef.current = pitch
  }, [yaw, pitch])

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(72, 1, 0.1, 1200)
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(mount.clientWidth, mount.clientHeight)
    renderer.domElement.className = 'panorama-canvas'
    mount.appendChild(renderer.domElement)

    const geometry = new THREE.SphereGeometry(500, 96, 64)
    geometry.scale(-1, 1, 1)
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff })
    const sphere = new THREE.Mesh(geometry, material)
    scene.add(sphere)

    let disposed = false
    let texture: THREE.Texture | null = null
    const loader = new THREE.TextureLoader()
    loader.load(src, (loadedTexture) => {
      if (disposed) {
        loadedTexture.dispose()
        return
      }
      loadedTexture.colorSpace = THREE.SRGBColorSpace
      loadedTexture.minFilter = THREE.LinearFilter
      loadedTexture.magFilter = THREE.LinearFilter
      loadedTexture.wrapS = THREE.RepeatWrapping
      loadedTexture.wrapT = THREE.ClampToEdgeWrapping
      texture = loadedTexture
      material.map = loadedTexture
      material.needsUpdate = true
    })

    const resize = () => {
      const width = mount.clientWidth
      const height = mount.clientHeight
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height)
    }

    const render = () => {
      const phi = THREE.MathUtils.degToRad(90 - pitchRef.current)
      const theta = THREE.MathUtils.degToRad(yawRef.current - 90)
      camera.lookAt(
        500 * Math.sin(phi) * Math.cos(theta),
        500 * Math.cos(phi),
        500 * Math.sin(phi) * Math.sin(theta),
      )
      renderer.render(scene, camera)
      if (!disposed) window.requestAnimationFrame(render)
    }

    window.addEventListener('resize', resize)
    resize()
    render()

    return () => {
      disposed = true
      window.removeEventListener('resize', resize)
      texture?.dispose()
      material.dispose()
      geometry.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [src])

  return <div className="panorama-viewer" ref={mountRef} />
}

export default PanoramaViewer
