<?php
declare(strict_types=1);

$outputDirectory = dirname(__DIR__) . '/netlify/icons';

foreach ([192, 512] as $size) {
    $image = imagecreatetruecolor($size, $size);
    imageantialias($image, true);
    $paper = imagecolorallocate($image, 247, 247, 242);
    imagefill($image, 0, 0, $paper);

    $scale = $size / 512;
    drawRoundedBar($image, 130, 258, 64, 130, 28, [137, 169, 152], $scale);
    drawRoundedBar($image, 224, 116, 64, 272, 28, [47, 105, 79], $scale);
    drawRoundedBar($image, 318, 190, 64, 198, 28, [91, 136, 115], $scale);

    imagepng($image, $outputDirectory . "/icon-{$size}.png", 9);
    imagedestroy($image);
}

function drawRoundedBar(GdImage $image, int $x, int $y, int $width, int $height, int $radius, array $rgb, float $scale): void
{
    $x = (int) round($x * $scale);
    $y = (int) round($y * $scale);
    $width = (int) round($width * $scale);
    $height = (int) round($height * $scale);
    $radius = (int) round($radius * $scale);
    $color = imagecolorallocate($image, $rgb[0], $rgb[1], $rgb[2]);

    imagefilledrectangle($image, $x, $y + $radius, $x + $width, $y + $height - $radius, $color);
    imagefilledrectangle($image, $x + $radius, $y, $x + $width - $radius, $y + $height, $color);
    imagefilledellipse($image, $x + $radius, $y + $radius, $radius * 2, $radius * 2, $color);
    imagefilledellipse($image, $x + $width - $radius, $y + $radius, $radius * 2, $radius * 2, $color);
    imagefilledellipse($image, $x + $radius, $y + $height - $radius, $radius * 2, $radius * 2, $color);
    imagefilledellipse($image, $x + $width - $radius, $y + $height - $radius, $radius * 2, $radius * 2, $color);
}
