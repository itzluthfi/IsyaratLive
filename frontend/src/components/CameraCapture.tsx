import { forwardRef, useEffect, useState, useImperativeHandle, useRef } from 'react'
import { Camera, RefreshCw, Lock, SwitchCamera } from 'lucide-react'
import { toast } from 'react-hot-toast'

interface CameraCaptureProps {
  onReady?: (video: HTMLVideoElement) => void
  canvasRef?: React.RefObject<HTMLCanvasElement | null>
}

/** Minta izin kamera otomatis, handle secure context (HTTPS di HP Wi-Fi), switch kamera depan/belakang, render video stream. */
export const CameraCapture = forwardRef<HTMLVideoElement, CameraCaptureProps>(
  function CameraCapture({ onReady, canvasRef }, ref) {
    const internalVideoRef = useRef<HTMLVideoElement | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [permissionStatus, setPermissionStatus] = useState<'prompt' | 'granted' | 'denied' | 'unknown'>('unknown')
    const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user')
    const [isSecureCtx, setIsSecureCtx] = useState(true)

    // Forward ref to both internal ref and parent ref
    useImperativeHandle(ref, () => internalVideoRef.current as HTMLVideoElement)

    useEffect(() => {
      // Periksa apakah halaman berjalan dalam Secure Context (HTTPS atau localhost)
      const secure = window.isSecureContext || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
      setIsSecureCtx(secure)
    }, [])

    const startCamera = async (currentFacingMode: 'user' | 'environment' = facingMode) => {
      setIsLoading(true)
      setError(null)

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setIsLoading(false)
        const errMsg = !window.isSecureContext
          ? 'Peramban HP membutuhkan koneksi HTTPS aman untuk mengizinkan akses kamera.'
          : 'Perangkat/Browser Anda tidak mendukung akses kamera (MediaDevices API missing).'
        setError(errMsg)
        toast.error(errMsg, { id: 'cam-api-missing' })
        setPermissionStatus('denied')
        return
      }

      try {
        // Hentikan stream lama jika ada
        const video = internalVideoRef.current
        if (video && video.srcObject) {
          const currentStream = video.srcObject as MediaStream
          currentStream.getTracks().forEach((track) => track.stop())
        }

        // Minta izin kamera secara otomatis dengan fallback constraint longgar
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: currentFacingMode,
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        })

        if (video) {
          video.srcObject = stream
          const playPromise = video.play()
          if (playPromise !== undefined) {
            playPromise.catch((err) => {
              // Ignore AbortError when play request is superseded
              if (err.name !== 'AbortError') {
                console.warn('Video play interrupted:', err)
              }
            })
          }
          setPermissionStatus('granted')
          setIsLoading(false)
          onReady?.(video)
        }
      } catch (err) {
        setIsLoading(false)
        const errMessage = err instanceof Error ? err.message : String(err)

        if (errMessage.includes('NotAllowedError') || errMessage.includes('Permission denied') || errMessage.includes('dismissed')) {
          setPermissionStatus('denied')
          const msg = 'Izin kamera ditolak atau ditutup. Harap izinkan kamera pada browser Anda.'
          setError(msg)
          toast.error(msg, { id: 'cam-perm-dismissed' })
        } else if (errMessage.includes('NotFoundError') || errMessage.includes('DevicesNotFoundError')) {
          const msg = 'Perangkat kamera tidak ditemukan.'
          setError(msg)
          toast.error(msg, { id: 'cam-not-found' })
        } else if (!window.isSecureContext) {
          const msg = 'Koneksi HTTP tidak aman di IP Wi-Fi HP. Gunakan HTTPS.'
          setError(msg)
          toast.error(msg, { id: 'cam-http-insecure' })
        } else {
          const msg = `Gagal membuka kamera: ${errMessage}`
          setError(msg)
          toast.error(msg, { id: 'cam-generic-err' })
        }
      }
    }

    // Panggil otomatis saat komponen pertama kali dipasang atau saat facingMode berubah
    useEffect(() => {
      startCamera(facingMode)

      return () => {
        const video = internalVideoRef.current
        if (video && video.srcObject) {
          const stream = video.srcObject as MediaStream
          stream.getTracks().forEach((track) => track.stop())
        }
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [facingMode])

    const handleSwitchHttps = () => {
      const httpsUrl = window.location.href.replace(/^http:/, 'https:')
      window.location.href = httpsUrl
    }

    const toggleFacingMode = () => {
      setFacingMode((prev) => (prev === 'user' ? 'environment' : 'user'))
    }

    return (
      <div className="flex flex-col gap-2">
        {/* Peringatan Secure Context jika dibuka lewat http://<ip-wifi> di HP */}
        {!isSecureCtx && (
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 rounded-2xl bg-amber-50 p-3.5 text-xs text-amber-900 border border-amber-300 shadow-xs">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 shrink-0 text-amber-700" />
              <div>
                <p className="font-bold">Akses Kamera di HP membutuhkan Protokol HTTPS!</p>
                <p className="text-[11px] text-amber-700">
                  Peramban HP memblokir permintaan izin kamera jika diakses via HTTP ({window.location.hostname}).
                </p>
              </div>
            </div>
            <button
              onClick={handleSwitchHttps}
              className="w-full sm:w-auto shrink-0 rounded-xl bg-amber-600 px-3.5 py-1.5 font-bold text-white shadow-2xs hover:bg-amber-700 active:scale-95 transition-all text-xs flex items-center gap-1.5"
            >
              <Lock className="w-3.5 h-3.5" /> Beralih ke HTTPS
            </button>
          </div>
        )}

        <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-slate-950 shadow-lg border border-slate-800 flex items-center justify-center">
          {/* Output Stream Video */}
          <video
            ref={internalVideoRef}
            className="h-full w-full object-cover"
            playsInline
            muted
            autoPlay
          />

          {/* Overlay Tracking Skeleton Canvas */}
          <canvas
            ref={canvasRef}
            className="pointer-events-none absolute inset-0 h-full w-full object-cover"
          />

          {/* Loading Indicator */}
          {isLoading && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-xs text-white p-4 text-center">
              <div className="h-9 w-9 animate-spin rounded-full border-3 border-teal-400 border-t-transparent mb-3" />
              <p className="text-xs font-bold">Meminta Izin & Membuka Kamera…</p>
              <p className="text-[11px] text-slate-400 mt-1">Harap pilih "Izinkan" / "Allow" pada notifikasi browser HP Anda</p>
            </div>
          )}

          {/* Overlays jika error atau izin kamera ditolak */}
          {!isLoading && error && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-950/90 p-5 text-center text-white">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500/20 text-rose-400 mb-2 border border-rose-500/30">
                <Camera className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-rose-300">Izin Kamera Diperlukan</h3>
              <p className="mt-1 max-w-sm text-xs text-slate-300">{error}</p>

              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                <button
                  onClick={() => startCamera(facingMode)}
                  className="rounded-xl bg-teal-600 px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-teal-500 active:scale-95 transition-all flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Coba Minta Izin Kamera Lagi
                </button>
                {!isSecureCtx && (
                  <button
                    onClick={handleSwitchHttps}
                    className="rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-amber-500 active:scale-95 transition-all flex items-center gap-1.5"
                  >
                    <Lock className="w-3.5 h-3.5" /> Beralih ke HTTPS
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Control Bar Kamera (Ganti Kamera Depan/Belakang & Minta Ulang Izin) */}
          {permissionStatus === 'granted' && (
            <div className="absolute bottom-3 right-3 z-10 flex items-center gap-2">
              <button
                onClick={toggleFacingMode}
                className="flex items-center gap-1.5 rounded-xl bg-slate-900/80 px-3 py-1.5 text-xs font-bold text-white backdrop-blur border border-slate-700 hover:bg-slate-800 active:scale-95 transition-all shadow-md"
                title="Ganti Kamera Depan / Belakang"
              >
                <SwitchCamera className="w-3.5 h-3.5" />
                {facingMode === 'user' ? 'Kamera Depan' : 'Kamera Belakang'}
              </button>
            </div>
          )}
        </div>
      </div>
    )
  },
)

