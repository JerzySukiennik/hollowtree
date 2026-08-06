"""Headless driver: build the hollow tree, verify, render, export.

Usage:
    Blender --background --python ht_drive.py -- [build|verify|render|all]
"""
import sys, os, importlib, json

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else ['all']
mode = argv[0] if argv else 'all'

import build_tree as B
importlib.reload(B)
import verify_tree as V
importlib.reload(V)

info = B.run()
print('BUILD_INFO', json.dumps(info))

if mode in ('verify', 'all'):
    V.mesh_audit()
    V.shaft_test()
    V.clearance()
    import ht_weldcheck as W
    importlib.reload(W)
    W.report()

if mode in ('render', 'all'):
    import render_tree as R
    importlib.reload(R)
    R.run()
    R.export_glb()
print('DONE')
