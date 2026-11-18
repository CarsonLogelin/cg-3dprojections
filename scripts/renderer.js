import * as CG from './transforms.js';
import { Matrix, Vector } from "./matrix.js";
 
const LEFT =   32; // binary 100000
const RIGHT =  16; // binary 010000
const BOTTOM = 8;  // binary 001000
const TOP =    4;  // binary 000100
const FAR =    2;  // binary 000010
const NEAR =   1;  // binary 000001
const FLOAT_EPSILON = 0.000001;
const MOVE_STEP = 1.0;
const ROTATE_STEP = Math.PI / 36;
 
class Renderer {
    // canvas:              object ({id: __, width: __, height: __})
    // scene:               object (...see description on Canvas)
    constructor(canvas, scene) {
        this.canvas = document.getElementById(canvas.id);
        this.canvas.width = canvas.width;
        this.canvas.height = canvas.height;
        this.ctx = this.canvas.getContext('2d');
        this.scene = this.processScene(scene);
        this.enable_animation = true;
        this.start_time = null;
        this.prev_time = null;
    }
 
    //
    updateTransforms(time, delta_time) {
        for (let i = 0; i < this.scene.models.length; i++) {
            let model = this.scene.models[i];
            if (!model.hasOwnProperty('animation')) {
                continue;
            }

            let theta = 2 * Math.PI * model.animation.rps * (time / 1000);
            let center = this.modelCenter(model);

            let to_origin = new Matrix(4, 4);
            let rotate = new Matrix(4, 4);
            let back = new Matrix(4, 4);
            CG.mat4x4Translate(to_origin, -center.x, -center.y, -center.z);
            if (model.animation.axis === 'x') {
                CG.mat4x4RotateX(rotate, theta);
            }
            else if (model.animation.axis === 'y') {
                CG.mat4x4RotateY(rotate, theta);
            }
            else {
                CG.mat4x4RotateZ(rotate, theta);
            }
            CG.mat4x4Translate(back, center.x, center.y, center.z);

            model.matrix = Matrix.multiply([back, rotate, to_origin]);
        }
    }

    // centre of a model - given for the built in shapes, averaged for generic ones
    modelCenter(model) {
        if (model.hasOwnProperty('center')) {
            return CG.Vector3(model.center.x, model.center.y, model.center.z);
        }
        let x = 0, y = 0, z = 0;
        for (let i = 0; i < model.vertices.length; i++) {
            x += model.vertices[i].x;
            y += model.vertices[i].y;
            z += model.vertices[i].z;
        }
        return CG.Vector3(x / model.vertices.length,
                          y / model.vertices.length,
                          z / model.vertices.length);
    }
 
    //
    rotateLeft() {
        this.rotateSrp(ROTATE_STEP);
    }

    //
    rotateRight() {
        this.rotateSrp(-ROTATE_STEP);
    }

    // swing the SRP around the v-axis, pivoting on the PRP
    rotateSrp(theta) {
        let axis = this.viewAxes().v;
        let dir = this.scene.view.srp.subtract(this.scene.view.prp);

        let cos = Math.cos(theta);
        let sin = Math.sin(theta);
        let cross = CG.Vector3(axis.y * dir.z - axis.z * dir.y,
                               axis.z * dir.x - axis.x * dir.z,
                               axis.x * dir.y - axis.y * dir.x);
        let dot = axis.x * dir.x + axis.y * dir.y + axis.z * dir.z;

        let turned = CG.Vector3(dir.x * cos + cross.x * sin + axis.x * dot * (1 - cos),
                                dir.y * cos + cross.y * sin + axis.y * dot * (1 - cos),
                                dir.z * cos + cross.z * sin + axis.z * dot * (1 - cos));

        this.scene.view.srp = this.scene.view.prp.add(turned);
        if (!this.enable_animation) {
            this.draw();
        }
    }
    
    //
    moveLeft() {
        this.slideCamera(this.viewAxes().u, -MOVE_STEP);
    }
 
    //
    moveRight() {
        this.slideCamera(this.viewAxes().u, MOVE_STEP);
    }
 
    //
    moveBackward() {
        this.slideCamera(this.viewAxes().n, MOVE_STEP);
    }
 
    //
    moveForward() {
        this.slideCamera(this.viewAxes().n, -MOVE_STEP);
    }
 
    // u, v, n for the current view
    viewAxes() {
        let n = this.scene.view.prp.subtract(this.scene.view.srp);
        n.normalize();
        let u = this.scene.view.vup.cross(n);
        u.normalize();
        let v = n.cross(u);
        return {u: u, v: v, n: n};
    }
 
    // move PRP and SRP together so the camera slides without turning
    slideCamera(axis, amount) {
        let step = CG.Vector3(axis.x * amount, axis.y * amount, axis.z * amount);
        this.scene.view.prp = this.scene.view.prp.add(step);
        this.scene.view.srp = this.scene.view.srp.add(step);
        if (!this.enable_animation) {
            this.draw();
        }
    }
 
    //
    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
 
        // TODO: implement drawing here!
        // For each model
        //   * For each vertex
        //     * transform endpoints to canonical view volume
        //   * For each line segment in each edge
        //     * clip in 3D
        //     * project to 2D
        //     * translate/scale to viewport (i.e. window)
        //     * draw line
        let view = this.scene.view;
        let models = this.scene.models;
        let viewport = CG.mat4x4Viewport(this.canvas.width, this.canvas.height);
        let mPer = CG.mat4x4MPer();
        let z_min = -view.clip[4]/view.clip[5];
        console.log(z_min);
 
 
        for(const model of models) {
            let nPer = CG.mat4x4Perspective(view.prp, view.srp, view.vup, view.clip);
            let updatedVertices = [];
            for(const vertex of model.vertices) {
                updatedVertices.push(Matrix.multiply([nPer, model.matrix, vertex]));
            }
            for(const edge of model.edges) {
                for(let i = 0; i < edge.length - 1; i++) {
                    let line = {pt0: updatedVertices[edge[i]], pt1: updatedVertices[edge[i + 1]]};
                    line = this.clipLinePerspective(line, z_min);
                    if(line != null) {
                        line.pt0 = Matrix.multiply([viewport, mPer, CG.Vector4(line.pt0.x, line.pt0.y, line.pt0.z, 1)]);
                        line.pt1 = Matrix.multiply([viewport, mPer, CG.Vector4(line.pt1.x, line.pt1.y, line.pt1.z, 1)]);
                        this.drawLine(line.pt0.x  / line.pt0.w, line.pt0.y / line.pt0.w, line.pt1.x / line.pt1.w, line.pt1.y / line.pt1.w);
                    }
                    
                }
            }
        }
        
    }
 
    // Get outcode for a vertex
    // vertex:       Vector4 (transformed vertex in homogeneous coordinates)
    // z_min:        float (near clipping plane in canonical view volume)
    outcodePerspective(vertex, z_min) {
        let outcode = 0;
        if (vertex.x < (vertex.z - FLOAT_EPSILON)) {
            outcode += LEFT;
        }
        else if (vertex.x > (-vertex.z + FLOAT_EPSILON)) {
            outcode += RIGHT;
        }
        if (vertex.y < (vertex.z - FLOAT_EPSILON)) {
            outcode += BOTTOM;
        }
        else if (vertex.y > (-vertex.z + FLOAT_EPSILON)) {
            outcode += TOP;
        }
        if (vertex.z < (-1.0 - FLOAT_EPSILON)) {
            outcode += FAR;
        }
        else if (vertex.z > (z_min + FLOAT_EPSILON)) {
            outcode += NEAR;
        }
        return outcode;
    }
 
    // Clip line - should either return a new line (with two endpoints inside view volume)
    //             or null (if line is completely outside view volume)
    // line:         object {pt0: Vector4, pt1: Vector4}
    // z_min:        float (near clipping plane in canonical view volume)
    clipLinePerspective(line, z_min) {
        let p0 = CG.Vector3(line.pt0.x, line.pt0.y, line.pt0.z); 
        let p1 = CG.Vector3(line.pt1.x, line.pt1.y, line.pt1.z);
        let out0 = this.outcodePerspective(p0, z_min);
        let out1 = this.outcodePerspective(p1, z_min);
        let deltaX = p1.x - p0.x;
        let deltaY = p1.y - p0.y;
        let deltaZ = p1.z - p0.z;
        let result = {pt0: p0, pt1: p1};
        // TODO: implement clipping here!
        let t = null;
        while(true) {
            if(out0 & out1) {
                return null;
            }
            if((out0 | out1) === 0) {
                return result;
            }
            console.log("out0: "  + out0);
            console.log("out1: " + out1);
            if(out0) {
                if(out0 & LEFT) {
                    t = (-p0.x + p0.z)/(deltaX - deltaZ);
                } else if(out0 & RIGHT) {
                    
                    t = (p0.x + p0.z)/(-deltaX - deltaZ);
                } else if(out0 & TOP) {
 
                    t = (p0.y + p0.z)/(-deltaY - deltaZ);
                } else if(out0 & BOTTOM) {
 
                    t = (-p0.y + p0.z)/(deltaY - deltaZ);
                } else if(out0 & FAR) {
 
                    t = (-p0.z - 1)/deltaZ;
                } else {
                    t = (p0.z - z_min)/-deltaZ;
                }
                if(t === null) {
                    continue;
                }
                p0.x = p0.x + (t * deltaX);
                p0.y = p0.y + (t * deltaY);
                p0.z = p0.z + (t * deltaZ);
                out0 = this.outcodePerspective(p0, z_min);
            } else if(out1){
                if(out1 & LEFT) {
                    console.log("left");
                    t = (-p1.x + p1.z)/(deltaX - deltaZ);
                } else if(out1 & RIGHT) {
                    
                    t = (p1.x + p1.z)/(-deltaX - deltaZ);
                } else if(out1 & TOP) {
 
                    t = (p1.y + p1.z)/(-deltaY - deltaZ);
                } else if(out1 & BOTTOM) {
 
                    t = (-p1.y + p1.z)/(deltaY - deltaZ);
                } else if(out1 & FAR) {
 
                    t = (-p1.z - 1)/deltaZ;
                } else {
                    t = (p1.z - z_min)/-deltaZ;
                }
                if(t === null) { 
                    continue;
                }
                p1.x = p1.x + (t * deltaX);
                p1.y = p1.y + (t * deltaY);
                p1.z = p1.z + (t * deltaZ);
                out1 = this.outcodePerspective(p1, z_min);
            }
            result = {pt0: p0, pt1: p1};
        }
        
    }
 
    //
    animate(timestamp) {
        // Get time and delta time for animation
        if (this.start_time === null) {
            this.start_time = timestamp;
            this.prev_time = timestamp;
        }
        let time = timestamp - this.start_time;
        let delta_time = timestamp - this.prev_time;
 
        // Update transforms for animation
        this.updateTransforms(time, delta_time);
 
        // Draw slide
        this.draw();
 
        // Invoke call for next frame in animation
        if (this.enable_animation) {
            window.requestAnimationFrame((ts) => {
                this.animate(ts);
            });
        }
 
        // Update previous time to current one for next calculation of delta time
        this.prev_time = timestamp;
    }
 
    //
    updateScene(scene) {
        this.scene = this.processScene(scene);
        if (!this.enable_animation) {
            this.draw();
        }
    }
 
    //
    processScene(scene) {
        let processed = {
            view: {
                prp: CG.Vector3(scene.view.prp[0], scene.view.prp[1], scene.view.prp[2]),
                srp: CG.Vector3(scene.view.srp[0], scene.view.srp[1], scene.view.srp[2]),
                vup: CG.Vector3(scene.view.vup[0], scene.view.vup[1], scene.view.vup[2]),
                clip: [...scene.view.clip]
            },
            models: []
        };
 
        for (let i = 0; i < scene.models.length; i++) {
            let model = { type: scene.models[i].type };
            if (model.type === 'generic') {
                model.vertices = [];
                model.edges = JSON.parse(JSON.stringify(scene.models[i].edges));
                for (let j = 0; j < scene.models[i].vertices.length; j++) {
                    model.vertices.push(CG.Vector4(scene.models[i].vertices[j][0],
                                                   scene.models[i].vertices[j][1],
                                                   scene.models[i].vertices[j][2],
                                                   1));
                    if (scene.models[i].hasOwnProperty('animation')) {
                        model.animation = JSON.parse(JSON.stringify(scene.models[i].animation));
                    }
                }
            }
            else {
                model.center = CG.Vector4(scene.models[i].center[0],
                                         scene.models[i].center[1],
                                         scene.models[i].center[2],
                                         1);
                for (let key in scene.models[i]) {
                    if (scene.models[i].hasOwnProperty(key) && key !== 'type' && key != 'center') {
                        model[key] = JSON.parse(JSON.stringify(scene.models[i][key]));
                    }
                }
                // ===== NEW (shape drawing): build vertices/edges for cube, cone, cylinder, sphere =====
                this.generateModel(model);
                // ===== END NEW =====
            }
 
            model.matrix = new Matrix(4, 4);
            processed.models.push(model);
        }
 
        return processed;
    }
 
    // =====================================================================
    // ===== NEW (shape drawing): everything from here to END NEW is new =====
    // =====================================================================
    // build vertices and edges for cube, cone, cylinder, and sphere models
    generateModel(model) {
        let cx = model.center.x, cy = model.center.y, cz = model.center.z;
        model.vertices = [];
        model.edges = [];
 
        if (model.type === 'cube') {
            let hw = model.width / 2, hh = model.height / 2, hd = model.depth / 2;
            // 0-3: front face (z + hd), 4-7: back face (z - hd)
            for (const z of [cz + hd, cz - hd]) {
                model.vertices.push(CG.Vector4(cx - hw, cy - hh, z, 1));
                model.vertices.push(CG.Vector4(cx + hw, cy - hh, z, 1));
                model.vertices.push(CG.Vector4(cx + hw, cy + hh, z, 1));
                model.vertices.push(CG.Vector4(cx - hw, cy + hh, z, 1));
            }
            model.edges = [
                [0, 1, 2, 3, 0],
                [4, 5, 6, 7, 4],
                [0, 4], [1, 5], [2, 6], [3, 7]
            ];
        }
        else if (model.type === 'cone') {
            // center is the middle of the base; apex is straight up
            let base = [];
            for (let i = 0; i < model.sides; i++) {
                let a = 2 * Math.PI * i / model.sides;
                model.vertices.push(CG.Vector4(cx + model.radius * Math.cos(a), cy,
                                               cz + model.radius * Math.sin(a), 1));
                base.push(i);
            }
            let apex = model.vertices.length;
            model.vertices.push(CG.Vector4(cx, cy + model.height, cz, 1));
            model.edges.push([...base, 0]);
            for (let i = 0; i < model.sides; i++) {
                model.edges.push([i, apex]);
            }
        }
        else if (model.type === 'cylinder') {
            // center is the middle of the cylinder
            let bottomY = cy - model.height / 2, topY = cy + model.height / 2;
            let bottom = [], top = [];
            for (let i = 0; i < model.sides; i++) {
                let a = 2 * Math.PI * i / model.sides;
                let x = cx + model.radius * Math.cos(a);
                let z = cz + model.radius * Math.sin(a);
                model.vertices.push(CG.Vector4(x, bottomY, z, 1));
                model.vertices.push(CG.Vector4(x, topY, z, 1));
                bottom.push(2 * i);
                top.push(2 * i + 1);
            }
            model.edges.push([...bottom, bottom[0]]);
            model.edges.push([...top, top[0]]);
            for (let i = 0; i < model.sides; i++) {
                model.edges.push([bottom[i], top[i]]);
            }
        }
        else if (model.type === 'sphere') {
            let r = model.radius;
            // poles
            model.vertices.push(CG.Vector4(cx, cy + r, cz, 1));   // 0: north
            model.vertices.push(CG.Vector4(cx, cy - r, cz, 1));   // 1: south
 
            // rings between the poles: stacks - 1 latitude rings, slices points each
            let rings = [];
            for (let st = 1; st < model.stacks; st++) {
                let phi = Math.PI * st / model.stacks;          // angle down from the north pole
                let ring = [];
                for (let sl = 0; sl < model.slices; sl++) {
                    let theta = 2 * Math.PI * sl / model.slices;
                    ring.push(model.vertices.length);
                    model.vertices.push(CG.Vector4(cx + r * Math.sin(phi) * Math.cos(theta),
                                                   cy + r * Math.cos(phi),
                                                   cz + r * Math.sin(phi) * Math.sin(theta), 1));
                }
                rings.push(ring);
                model.edges.push([...ring, ring[0]]);           // latitude line
            }
 
            // longitude lines: north pole -> each ring -> south pole
            for (let sl = 0; sl < model.slices; sl++) {
                let line = [0];
                for (const ring of rings) {
                    line.push(ring[sl]);
                }
                line.push(1);
                model.edges.push(line);
            }
        }
    }
    
    // ===== END NEW =====
    
    // x0:           float (x coordinate of p0)
    // y0:           float (y coordinate of p0)
    // x1:           float (x coordinate of p1)
    // y1:           float (y coordinate of p1)
    drawLine(x0, y0, x1, y1) {
        this.ctx.strokeStyle = '#000000';
        this.ctx.beginPath();
        this.ctx.moveTo(x0, y0);
        this.ctx.lineTo(x1, y1);
        this.ctx.stroke();
 
        this.ctx.fillStyle = '#FF0000';
        this.ctx.fillRect(x0 - 2, y0 - 2, 4, 4);
        this.ctx.fillRect(x1 - 2, y1 - 2, 4, 4);
    }
};
 
export { Renderer };