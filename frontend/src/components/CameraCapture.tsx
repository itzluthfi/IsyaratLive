import { forwardRef, useEffect, useState } from 'react'

interface CameraCaptureProps {
  onReady?: (video: HTMLVideoElement) => void
}

/** Minta izin kamera, render video stream. Ref diekspos supaya LandmarkDetector bisa membaca frame. */
export const CameraCapture = forwardRef<HTMLVideoElement, CameraCaptureProps>(
  function CameraCapture({ onReady }, ref) {
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
      let stream: MediaStream | null = null
      const video = (ref as React.RefObject<HTMLVideoElement>)?.current

      async function start() {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user', width: 640, height: 480 },
            audio: false,
          })
          if (video) {
            video.srcObject = stream
            await video.play()
            onReady?.(video)
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Gagal mengakses kamera')
        }
      }

      start()

      return () => {
        stream?.getTracks().forEach((track) => track.stop())
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    if (error) {
      return (
        <div className="flex aspect-video w-full items-center justify-center rounded-lg bg-red-50 text-red-700">
          Tidak bisa mengakses kamera: {error}
        </div>
      )
    }

    return (
      <video
        ref={ref}
        className="aspect-video w-full rounded-lg bg-black object-cover"
        playsInline
        muted
      />
    )
  },
)
