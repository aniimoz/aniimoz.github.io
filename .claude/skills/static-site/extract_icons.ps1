param(
  [string]$Src = "D:\Projects\aniimo",
  [string]$Dst = "D:\Projects\aniimoz.github.io\assets\icons",
  [int]$Size = 128
)
Add-Type -AssemblyName System.Drawing
New-Item -ItemType Directory -Force $Dst | Out-Null

# Thứ tự file khi sort theo tên: ám, ánh sáng, băng, điện, lửa, nước, phong, thảo, thổ
$slugs = @('am','anh-sang','bang','dien','lua','nuoc','phong','co','tho')
$files = Get-ChildItem $Src -Filter *.png | Sort-Object Name
if ($files.Count -ne 9) { throw "Expected 9 source images, got $($files.Count)" }

# Icon hệ to nằm giữa panel "Phe Công", quanh (714,596) trong ảnh 1920x1080
$ax = 714; $ay = 596; $search = 46

for ($k = 0; $k -lt 9; $k++) {
  $img = New-Object System.Drawing.Bitmap($files[$k].FullName)
  $minX = 9999; $minY = 9999; $maxX = -1; $maxY = -1
  for ($y = $ay - $search; $y -le $ay + $search; $y++) {
    for ($x = $ax - $search; $x -le $ax + $search; $x++) {
      if ((($x-$ax)*($x-$ax) + ($y-$ay)*($y-$ay)) -gt ($search*$search)) { continue }
      $c = $img.GetPixel($x, $y)
      if ($c.GetSaturation() -gt 0.22 -and $c.GetBrightness() -lt 0.92) {
        if ($x -lt $minX) { $minX = $x }; if ($x -gt $maxX) { $maxX = $x }
        if ($y -lt $minY) { $minY = $y }; if ($y -gt $maxY) { $maxY = $y }
      }
    }
  }
  $cx = ($minX + $maxX + 1) / 2.0; $cy = ($minY + $maxY + 1) / 2.0
  $d = [Math]::Max($maxX - $minX + 1, $maxY - $minY + 1)
  $r = $d / 2.0 - 0.75   # cắt hụt nhẹ để không dính viền trắng

  # Phóng icon vào khung vuông Size x Size
  $scaled = New-Object System.Drawing.Bitmap($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $gs = [System.Drawing.Graphics]::FromImage($scaled)
  $gs.InterpolationMode = 'HighQualityBicubic'; $gs.PixelOffsetMode = 'HighQuality'
  $srcRect = New-Object System.Drawing.RectangleF(($cx - $r), ($cy - $r), (2*$r), (2*$r))
  $dstRect = New-Object System.Drawing.RectangleF(0, 0, $Size, $Size)
  $gs.DrawImage($img, $dstRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)
  $gs.Dispose()

  # Mặt nạ tròn khử răng cưa, ngoài vòng tròn trong suốt
  $out = New-Object System.Drawing.Bitmap($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $go = [System.Drawing.Graphics]::FromImage($out)
  $go.Clear([System.Drawing.Color]::Transparent)
  $go.SmoothingMode = 'AntiAlias'; $go.PixelOffsetMode = 'HighQuality'
  $brush = New-Object System.Drawing.TextureBrush($scaled)
  $go.FillEllipse($brush, 0, 0, $Size, $Size)
  $brush.Dispose(); $go.Dispose(); $scaled.Dispose(); $img.Dispose()

  $path = Join-Path $Dst "$($slugs[$k]).png"
  $out.Save($path, [System.Drawing.Imaging.ImageFormat]::Png); $out.Dispose()
  "{0,-9} circle center=({1},{2}) diameter={3}px -> {4}px  {5:N1} KB" -f $slugs[$k], $cx, $cy, $d, $Size, ((Get-Item $path).Length/1KB)
}
