#!/usr/bin/env python3
"""Locally test compiled preview publication without touching the real site."""
from pathlib import Path
from tempfile import TemporaryDirectory
import subprocess

SCRIPT = Path(__file__).resolve().parents[1] / 'scripts/publish_sounds_preview.sh'


def git(*args, cwd=None, check=True):
    return subprocess.run(['git', *map(str, args)], cwd=cwd, text=True,
                          capture_output=True, check=check).stdout.strip()


def configure(path):
    git('config', 'user.name', 'Test User', cwd=path)
    git('config', 'user.email', 'test@example.org', cwd=path)


def make_base(origin, author):
    git('init', '--bare', origin)
    git('init', '-b', 'pages-build', author)
    configure(author)
    git('remote', 'add', 'origin', origin, cwd=author)
    files = {'index.html': 'SAFE CODE', 'lab-sw.js': 'SAFE OFFLINE',
             'runtime/sclang/sclang.js': 'SCLANG', 'runtime/scsynth/scsynth.js': 'SCSYNTH',
             'sounds.html': 'OLD SOUNDS', 'sounds-lab.html': 'OLD BENCH',
             'sounds-tools.mjs': 'OLD MODULE', 'librivox-explorer.html': 'OLD LIBRIVOX',
             'librivox-explorer.css': 'OLD CSS', 'librivox-explorer.mjs': 'OLD SCRIPT',
             'lab-offline-assets.json': '{}'}
    for name, data in files.items():
        file = author / name
        file.parent.mkdir(exist_ok=True, parents=True)
        file.write_text(data)
    git('add', '.', cwd=author)
    git('commit', '-m', 'Base compiled site', cwd=author)
    git('push', 'origin', 'HEAD:refs/heads/pages-build', cwd=author)
    base = git('rev-parse', 'HEAD', cwd=author)
    git('switch', '-c', 'sounds/cohesive-integration-20261124', cwd=author)
    (author / 'sample.txt').write_text('one')
    git('add', 'sample.txt', cwd=author)
    git('commit', '-m', 'PR source', cwd=author)
    git('push', 'origin', 'HEAD:refs/heads/sounds/cohesive-integration-20261124', cwd=author)
    sha = git('rev-parse', 'HEAD', cwd=author)
    return base, sha


def stage(site, value='NEW SOUNDS'):
    (site / 'index.html').write_text('NEW INTEGRATED CODE')
    (site / 'sounds.html').write_text(value)
    (site / 'sound-surfaces-design.css').write_text('SHARED THEME STYLES')
    (site / 'sound-surfaces-theme.mjs').write_text('SHARED THEME SETTINGS')
    (site / 'librivox-explorer.html').write_text('NEW LIBRIVOX')
    (site / 'lab-offline-assets.json').write_text('{"index":"new"}')


def publish(site, sha, expected=0):
    p = subprocess.run(['bash', str(SCRIPT), str(site),
                        'sounds/cohesive-integration-20261124', sha, '35'],
                       text=True, capture_output=True)
    assert p.returncode == expected, (p.stdout, p.stderr)
    return p.stdout + p.stderr


def main():
    with TemporaryDirectory() as tmp:
        root = Path(tmp)
        origin, author, site = (root / x for x in ('origin.git', 'author', 'site'))
        base, sha = make_base(origin, author)
        git('clone', '-b', 'pages-build', origin, site)
        stage(site)
        assert 'Published isolated' in publish(site, sha)
        assert git('rev-parse', 'refs/heads/pages-build', cwd=origin) == base
        preview = 'refs/heads/pages-preview-sounds-pr-35'
        first = git('rev-parse', preview, cwd=origin)
        assert git('show', f'{first}:sounds.html', cwd=origin) == 'NEW SOUNDS'
        assert git('show', f'{first}:index.html', cwd=origin) == 'NEW INTEGRATED CODE'
        assert git('show', f'{first}:sound-surfaces-design.css', cwd=origin) == 'SHARED THEME STYLES'
        assert git('show', f'{first}:sound-surfaces-theme.mjs', cwd=origin) == 'SHARED THEME SETTINGS'
        assert git('show', f'{base}:index.html', cwd=origin) == 'SAFE CODE'
        assert git('show', f'{first}:lab-sw.js', cwd=origin) == 'SAFE OFFLINE'
        assert git('show', f'{first}:runtime/sclang/sclang.js', cwd=origin) == 'SCLANG'
        assert git('show', f'{first}:runtime/scsynth/scsynth.js', cwd=origin) == 'SCSYNTH'
        # Next source revision must replace only the same isolated preview.
        (author / 'sample.txt').write_text('two')
        git('add', 'sample.txt', cwd=author)
        git('commit', '-m', 'Updated source', cwd=author)
        git('push', 'origin', 'HEAD:refs/heads/sounds/cohesive-integration-20261124', cwd=author)
        new_sha = git('rev-parse', 'HEAD', cwd=author)
        git('clone', '-b', 'pages-build', origin, root / 'site2')
        newer_site = root / 'site2'
        stage(newer_site, 'UPDATED SOUNDS')
        assert 'stale preview' in publish(newer_site, sha)
        assert git('rev-parse', preview, cwd=origin) == first
        assert 'Published isolated' in publish(newer_site, new_sha)
        second = git('rev-parse', preview, cwd=origin)
        assert second != first
        assert git('show', f'{second}:sounds.html', cwd=origin) == 'UPDATED SOUNDS'
        assert git('show', f'{second}:index.html', cwd=origin) == 'NEW INTEGRATED CODE'
        assert git('rev-parse', 'refs/heads/pages-build', cwd=origin) == base
        # A stale compiled base must fail rather than preview inconsistent Code.
        git('switch', 'pages-build', cwd=author)
        (author / 'index.html').write_text('NEW LIVE CODE')
        git('add', 'index.html', cwd=author)
        git('commit', '-m', 'Main site advances', cwd=author)
        git('push', 'origin', 'HEAD:refs/heads/pages-build', cwd=author)
        git('clone', '-b', 'pages-build', origin, root / 'site3')
        stage(root / 'site3')
        git('reset', '--hard', base, cwd=root / 'site3')
        assert 'stale compiled preview' in publish(root / 'site3', new_sha, expected=1)
        assert git('rev-parse', preview, cwd=origin) == second
        # No compiled engines means never push.
        git('clone', '-b', 'pages-build', origin, root / 'site4')
        (root / 'site4/runtime/sclang/sclang.js').unlink()
        stage(root / 'site4')
        assert 'compiled SuperCollider runtime' in publish(root / 'site4', new_sha, expected=2)
        print('Preview publication passed: atomic Code/Sounds/LibriVox/theme payload, compiled runtime, stale-source and base protection')


if __name__ == '__main__':
    main()
