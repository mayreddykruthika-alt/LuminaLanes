"""
LuminaLanes — Flask Web Application Backend
Serves 2D and 3D Digital Twin Simulation Environments.
"""

from flask import Flask, render_template

app = Flask(__name__)

@app.route('/')
def index():
    """Default entry point rendering the 3D Digital Twin simulation."""
    return render_template('3d_view.html')

@app.route('/3d-sim')
def three_d_sim():
    """3D Digital Twin simulation route powered by Three.js."""
    return render_template('3d_view.html')

if __name__ == '__main__':
    print("[LuminaLanes] Starting 3D Digital Twin Flask Server on http://127.0.0.1:5000/3d-sim")
    app.run(debug=True, host='0.0.0.0', port=5000)
