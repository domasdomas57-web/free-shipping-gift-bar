Add-Type -AssemblyName System.Drawing

$output = "c:\Users\domas\free-shipping-bundle\public\images\free-shipping-bar-preview.png"
$width = 1200
$height = 480

$bitmap = New-Object System.Drawing.Bitmap $width, $height
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality

$rect = New-Object System.Drawing.Rectangle 0, 0, $width, $height
$startColor = [System.Drawing.Color]::FromArgb(89, 35, 230)
$endColor = [System.Drawing.Color]::FromArgb(6, 165, 106)
$gradientBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, $startColor, $endColor, 0.0
$graphics.FillRectangle($gradientBrush, $rect)

$fontLarge = New-Object System.Drawing.Font "Segoe UI", 88, [System.Drawing.FontStyle]::Bold
$fontMedium = New-Object System.Drawing.Font "Segoe UI", 48, [System.Drawing.FontStyle]::Regular
$white = [System.Drawing.Brushes]::White
$shadowColor = [System.Drawing.Color]::FromArgb(90, 0, 0, 0)
$shadowBrush = New-Object System.Drawing.SolidBrush $shadowColor

$graphics.DrawString("Spend EUR 20 more", $fontMedium, $shadowBrush, 76, 100)
$graphics.DrawString("Spend EUR 20 more", $fontMedium, $white, 70, 94)
$graphics.DrawString("to unlock Free Shipping!", $fontMedium, $shadowBrush, 56, 180)
$graphics.DrawString("to unlock Free Shipping!", $fontMedium, $white, 50, 174)

$graphics.DrawString("Congratulations!", $fontLarge, $shadowBrush, 56, 260)
$graphics.DrawString("Congratulations!", $fontLarge, $white, 50, 254)
$graphics.DrawString("You unlocked Free Shipping!", $fontMedium, $shadowBrush, 56, 350)
$graphics.DrawString("You unlocked Free Shipping!", $fontMedium, $white, 50, 344)

$bitmap.Save($output, [System.Drawing.Imaging.ImageFormat]::Png)

$shadowBrush.Dispose()
$gradientBrush.Dispose()
$graphics.Dispose()
$bitmap.Dispose()
