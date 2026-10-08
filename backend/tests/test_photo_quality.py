from PIL import Image, ImageDraw, ImageFilter

from backend.app.photo_quality import photo_quality


def detailed_photo():
    image = Image.new('RGB', (256, 256), 'green')
    draw = ImageDraw.Draw(image)
    for y in range(0, 256, 16):
        for x in range(0, 256, 16):
            if (x // 16 + y // 16) % 2:
                draw.rectangle((x, y, x + 15, y + 15), fill='white')
    return image


def kinds(image):
    return {issue['kind'] for issue in photo_quality(image)['issues']}


def test_blur_hint_distinguishes_detail_from_heavily_blurred_photo():
    assert not photo_quality(detailed_photo())['needs_review']
    assert 'blur' in kinds(detailed_photo().filter(ImageFilter.GaussianBlur(12)))


def test_framing_hint_requires_small_foreground_and_uniform_background():
    small = Image.new('RGB', (256, 256), 'white')
    ImageDraw.Draw(small).rectangle((116, 116, 140, 140), fill='black')
    assert 'framing' in kinds(small)
    ImageDraw.Draw(small).rectangle((40, 40, 216, 216), fill='black')
    assert 'framing' not in kinds(small)
    assert 'framing' not in kinds(detailed_photo())


def test_small_original_and_plain_frame_receive_cautious_quality_hints():
    assert 'resolution' in kinds(Image.new('RGB', (40, 40), 'green'))
    issues = photo_quality(Image.new('RGB', (256, 256), 'green'))['issues']
    assert any('may be' in issue['title'] for issue in issues)


