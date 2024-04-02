import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'; // 可用于导入压缩后的模型
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import Stats from 'stats.js';
import { GUI } from 'three/examples/jsm/libs/lil-gui.module.min.js';
import { MeshBVH, MeshBVHHelper, StaticGeometryGenerator } from 'three-mesh-bvh';

//gui的参数
const params = {

    firstPerson: false, // 是否第一人称

    displayCollider: false, // 是否显示碰撞体

    displayBVH: false, // 是否显示BVH

    visualizeDepth: 10, // BVH深度

    gravity: - 30, // 重力

    playerSpeed: 10, // 玩家速度

    physicsSteps: 5, // 物理模拟的步数

    reset: reset, // 是否重置

};
//存储Three.js渲染器、相机、场景、时钟、用户界面（GUI）和性能统计（Stats）等对象
let renderer, camera, scene, clock, gui, stats;
//用于存储场景中的环境模型、碰撞器、可视化器、玩家对象以及控制器对象。
let environment, collider, visualizer, player, controls;
// 用于跟踪玩家是否在地面上。
let playerIsOnGround = false;
// 跟踪玩家是否按下了前进、后退、左移或右移的按键
let fwdPressed = false, bkdPressed = false, lftPressed = false, rgtPressed = false;
// 用于跟踪玩家的速度
let playerVelocity = new THREE.Vector3();
// 表示世界坐标系中的上向量。
let upVector = new THREE.Vector3(0, 1, 0);
// 用于在代码中临时存储向量数据。
let tempVector = new THREE.Vector3();
let tempVector2 = new THREE.Vector3();
// 临时存储包围盒数据
let tempBox = new THREE.Box3();
// 临时存储矩阵数据
let tempMat = new THREE.Matrix4();
// 存储线段数据
let tempSegment = new THREE.Line3();

init();
render();

function init() {

    const bgColor = 0x263238 / 2;

    // renderer setup
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(bgColor, 1);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputEncoding = THREE.sRGBEncoding;
    document.body.appendChild(renderer.domElement);

    // scene setup
    scene = new THREE.Scene();
    scene.fog = new THREE.Fog(bgColor, 20, 70);

    // lights
    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(1, 1.5, 1).multiplyScalar(50);
    light.shadow.mapSize.setScalar(2048);
    light.shadow.bias = - 1e-4;
    light.shadow.normalBias = 0.05;
    light.castShadow = true;

    const shadowCam = light.shadow.camera;
    shadowCam.bottom = shadowCam.left = - 30;
    shadowCam.top = 30;
    shadowCam.right = 45;

    scene.add(light);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 0.4));

    // camera setup
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 50);
    camera.position.set(10, 10, - 10);
    camera.far = 100;
    camera.updateProjectionMatrix();
    window.camera = camera;

    clock = new THREE.Clock();

    controls = new OrbitControls(camera, renderer.domElement);

    // stats setup
    stats = new Stats();
    document.body.appendChild(stats.dom);

    loadColliderEnvironment();

    // character
    player = new THREE.Mesh(
        new RoundedBoxGeometry(1.0, 2.0, 1.0, 10, 0.5),
        new THREE.MeshStandardMaterial()
    );
    // 几何体沿着Y轴负方向平移了0.5个单位，使得玩家模型的底部与网格的原点对齐。
    player.geometry.translate(0, - 0.5, 0);

    // 包含了玩家的胶囊碰撞器的信息，其中radius表示碰撞器的半径，segment表示碰撞器的线段，用于进行碰撞检测。
    player.capsuleInfo = {
        radius: 0.5,
        segment: new THREE.Line3(new THREE.Vector3(), new THREE.Vector3(0, - 1.0, 0.0))
    };

    player.castShadow = true;
    player.receiveShadow = true;
    player.material.shadowSide = 2;
    scene.add(player);
    reset();

    // dat.gui
    gui = new GUI();
    gui.add(params, 'firstPerson').onChange(v => {

        if (!v) {

            // 如果firstPerson的值为false，则调整相机的位置，使其处于一种远距离的观察模式，相机位置会根据控制器的目标进行调整。
            camera
                .position
                .sub(controls.target)
                .normalize()
                .multiplyScalar(10)
                .add(controls.target);

        }

    });

    // 这段代码向Visualization文件夹中添加了三个控件，分别是控制是否显示碰撞器、是否显示 BVH、
    // 以及可视化深度的控件。当visualizeDepth控件的值发生变化时，会调用回调函数，更新可视化的深度。
    const visFolder = gui.addFolder('Visualization');
    visFolder.add(params, 'displayCollider');
    visFolder.add(params, 'displayBVH');
    visFolder.add(params, 'visualizeDepth', 1, 20, 1).onChange(v => {

        visualizer.depth = v;
        visualizer.update();

    });
    visFolder.open();

    const physicsFolder = gui.addFolder('Player');
    physicsFolder.add(params, 'physicsSteps', 0, 30, 1);
    physicsFolder.add(params, 'gravity', - 100, 100, 0.01).onChange(v => {

        params.gravity = parseFloat(v);

    });
    physicsFolder.add(params, 'playerSpeed', 1, 20);
    physicsFolder.open();

    gui.add(params, 'reset');
    gui.open();

    window.addEventListener('resize', function () {

        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();

        renderer.setSize(window.innerWidth, window.innerHeight);

    }, false);

    window.addEventListener('keydown', function (e) {

        switch (e.code) {

            case 'KeyW': fwdPressed = true; break;
            case 'KeyS': bkdPressed = true; break;
            case 'KeyD': rgtPressed = true; break;
            case 'KeyA': lftPressed = true; break;
            case 'Space':
                if (playerIsOnGround) {

                    playerVelocity.y = 10.0;
                    playerIsOnGround = false;

                }

                break;

        }

    });

    window.addEventListener('keyup', function (e) {

        switch (e.code) {

            case 'KeyW': fwdPressed = false; break;
            case 'KeyS': bkdPressed = false; break;
            case 'KeyD': rgtPressed = false; break;
            case 'KeyA': lftPressed = false; break;

        }

    });

}

function loadColliderEnvironment() {

    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('js/libs/draco/gltf/');
    const gltfLoader = new GLTFLoader();
    gltfLoader.setDRACOLoader(dracoLoader);

    gltfLoader.load('models/dungeon_low_poly_game_level_challenge/scene.gltf', res => {
        // .load('models/dungeon_low_poly_game_level_challenge/scene.gltf', res => {

        const gltfScene = res.scene;
        gltfScene.scale.setScalar(.01);

        // 这几行代码创建了一个Box3对象用于计算场景的包围盒，
        // 并将场景的中心点设置为原点（0,0,0）。updateMatrixWorld(true)用于更新场景中所有对象的世界变换矩阵。
        const box = new THREE.Box3();
        box.setFromObject(gltfScene);
        box.getCenter(gltfScene.position).negate();
        gltfScene.updateMatrixWorld(true);

        // visual geometry setup
        // 这段代码遍历场景中的每个物体，如果该物体是一个Mesh并且材质颜色的红色通道为1.0，
        // 则忽略该物体。否则，将该物体按材质颜色分组存储到toMerge对象中。
        const toMerge = {};
        gltfScene.traverse(c => {

            if (
                // 	/Boss/.test( c.name ) ||
                // /Enemie/.test( c.name ) ||
                // /Shield/.test( c.name ) ||
                // /Sword/.test( c.name ) ||
                // /Character/.test( c.name ) ||
                // /Gate/.test( c.name ) ||

                // // spears
                // /Cube/.test( c.name ) ||

                // pink brick
                c.material && c.material.color.r === 1.0
            ) {

                return;

            }

            if (c.isMesh) {

                const hex = c.material.color.getHex();
                toMerge[hex] = toMerge[hex] || [];
                toMerge[hex].push(c);

            }

        });

        // 这段代码遍历了存储在toMerge对象中的各个颜色分组，对每个颜色分组中的物体进行合并处理，
        // 并将合并后的物体添加到环境对象中。
        environment = new THREE.Group();
        for (const hex in toMerge) {

            const arr = toMerge[hex];
            const visualGeometries = [];
            arr.forEach(mesh => {

                if (mesh.material.emissive.r !== 0) {

                    environment.attach(mesh);

                } else {

                    const geom = mesh.geometry.clone();
                    geom.applyMatrix4(mesh.matrixWorld);
                    visualGeometries.push(geom);

                }

            });

            if (visualGeometries.length) {

                const newGeom = BufferGeometryUtils.mergeGeometries(visualGeometries);
                const newMesh = new THREE.Mesh(newGeom, new THREE.MeshStandardMaterial({ color: parseInt(hex), shadowSide: 2 }));
                newMesh.castShadow = true;
                newMesh.receiveShadow = true;
                newMesh.material.shadowSide = 2;

                environment.add(newMesh);

            }

        }

        // 这几行代码使用静态几何体生成器StaticGeometryGenerator从环境对象中生成合并后的几何体，
        // 并为生成的几何体创建了边界体层次结构（BVH）。
        const staticGenerator = new StaticGeometryGenerator(environment);
        staticGenerator.attributes = ['position'];

        const mergedGeometry = staticGenerator.generate();
        mergedGeometry.boundsTree = new MeshBVH(mergedGeometry);

        // 这几行代码创建了一个网格对象作为碰撞器，并设置了碰撞器的材质为半透明的线框材质。
        collider = new THREE.Mesh(mergedGeometry);
        collider.material.wireframe = true;
        collider.material.opacity = 0.5;
        collider.material.transparent = true;

        // 这几行代码创建了一个用于可视化碰撞器边界体层次结构的辅助对象，并将其添加到场景中。
        // 然后，将碰撞器、环境对象以及辅助对象都添加到了场景中
        visualizer = new MeshBVHHelper(collider, params.visualizeDepth);
        scene.add(visualizer);
        scene.add(collider);
        scene.add(environment);

    });

}

function reset() {

    playerVelocity.set(0, 0, 0);
    player.position.set(15.75, - 3, 30);
    camera.position.sub(controls.target);
    controls.target.copy(player.position);
    camera.position.add(player.position);
    controls.update();

}

//用于更新玩家角色的位置和状态
function updatePlayer(delta) {

    // 根据玩家是否在地面上，调整玩家的垂直速度。
    // 根据物理规则，玩家在地面上时，垂直速度受重力影响；不在地面上时，垂直速度会逐渐增加。
    if (playerIsOnGround) {

        playerVelocity.y = delta * params.gravity;

    } else {

        playerVelocity.y += delta * params.gravity;

    }

    // 根据玩家的速度和时间间隔，更新玩家的位置。
    player.position.addScaledVector(playerVelocity, delta);

    // move the player
    // 获取相机控制器的方位角，用于确定玩家的移动方向。
    const angle = controls.getAzimuthalAngle();

    // 如果向前按键被按下，则根据相机的方向计算出玩家的移动方向，并根据移动速度和时间间隔更新玩家的位置。
    if (fwdPressed) {

        tempVector.set(0, 0, - 1).applyAxisAngle(upVector, angle);
        player.position.addScaledVector(tempVector, params.playerSpeed * delta);

    }

    if (bkdPressed) {

        tempVector.set(0, 0, 1).applyAxisAngle(upVector, angle);
        player.position.addScaledVector(tempVector, params.playerSpeed * delta);

    }

    if (lftPressed) {

        tempVector.set(- 1, 0, 0).applyAxisAngle(upVector, angle);
        player.position.addScaledVector(tempVector, params.playerSpeed * delta);

    }

    if (rgtPressed) {

        tempVector.set(1, 0, 0).applyAxisAngle(upVector, angle);
        player.position.addScaledVector(tempVector, params.playerSpeed * delta);

    }

    player.updateMatrixWorld();

    // adjust player position based on collisions
    const capsuleInfo = player.capsuleInfo;
    // 轴对齐的包围盒，用于碰撞检测或其他几何计算
    tempBox.makeEmpty();
    tempMat.copy(collider.matrixWorld).invert();
    tempSegment.copy(capsuleInfo.segment);

    // get the position of the capsule in the local space of the collider
    tempSegment.start.applyMatrix4(player.matrixWorld).applyMatrix4(tempMat);
    tempSegment.end.applyMatrix4(player.matrixWorld).applyMatrix4(tempMat);

    // 调整边界盒以确保其包含整个胶囊碰撞体，以便后续的碰撞检测计算可以正确地进行。
    // get the axis aligned bounding box of the capsule
    tempBox.expandByPoint(tempSegment.start);
    tempBox.expandByPoint(tempSegment.end);

    tempBox.min.addScalar(- capsuleInfo.radius);
    tempBox.max.addScalar(capsuleInfo.radius);

    // 使用碰撞体的边界树（boundsTree）进行碰撞检测。
    // shapecast()函数用于在边界树中进行形状投射碰撞检测，返回所有与指定形状相交的物体。
    collider.geometry.boundsTree.shapecast({

        // 用于判断碰撞体的边界盒是否与指定的边界盒 tempBox 相交。
        // 如果碰撞体的边界盒与 tempBox 相交，那么该函数会返回 true，表示碰撞体可能与待检测物体相交。
        intersectsBounds: box => box.intersectsBox(tempBox),


        // 用于在与碰撞体边界盒相交的情况下，进一步检测碰撞体是否与三角形相交。
        // 如果碰撞体与三角形相交，将会执行一系列操作，用于调整胶囊碰撞体的位置以避免穿透。
        intersectsTriangle: tri => {

            // check if the triangle is intersecting the capsule and adjust the
            // capsule position if it is.
            const triPoint = tempVector;
            const capsulePoint = tempVector2;

            // 计算了三角形与胶囊碰撞体段（segment）之间的最近点距离。
            const distance = tri.closestPointToSegment(tempSegment, triPoint, capsulePoint);

            // 如果距离小于半径，表示碰撞发生，需要对碰撞体位置进行调整
            if (distance < capsuleInfo.radius) {

                const depth = capsuleInfo.radius - distance;
                const direction = capsulePoint.sub(triPoint).normalize();

                tempSegment.start.addScaledVector(direction, depth);
                tempSegment.end.addScaledVector(direction, depth);

            }

        }

    });

    // get the adjusted position of the capsule collider in world space after checking
    // triangle collisions and moving it. capsuleInfo.segment.start is assumed to be
    // the origin of the player model.
    const newPosition = tempVector;
    newPosition.copy(tempSegment.start).applyMatrix4(collider.matrixWorld);

    // check how much the collider was moved
    const deltaVector = tempVector2;
    deltaVector.subVectors(newPosition, player.position);

    // if the player was primarily adjusted vertically we assume it's on something we should consider ground
    playerIsOnGround = deltaVector.y > Math.abs(delta * playerVelocity.y * 0.25);

    const offset = Math.max(0.0, deltaVector.length() - 1e-5);
    deltaVector.normalize().multiplyScalar(offset);

    // adjust the player model
    player.position.add(deltaVector);

    if (!playerIsOnGround) {

        deltaVector.normalize();
        playerVelocity.addScaledVector(deltaVector, - deltaVector.dot(playerVelocity));

    } else {

        playerVelocity.set(0, 0, 0);

    }

    // adjust the camera
    camera.position.sub(controls.target);
    controls.target.copy(player.position);
    camera.position.add(player.position);

    // if the player has fallen too far below the level reset their position to the start
    if (player.position.y < - 15) {

        reset();

    }

}

function render() {

    stats.update();
    requestAnimationFrame(render);

    const delta = Math.min(clock.getDelta(), 0.1);
    if (params.firstPerson) {

        controls.maxPolarAngle = Math.PI;
        controls.minDistance = 1e-4;
        controls.maxDistance = 1e-4;

    } else {

        controls.maxPolarAngle = Math.PI / 2;
        controls.minDistance = 1;
        controls.maxDistance = 20;

    }

    if (collider) {

        collider.visible = params.displayCollider;
        visualizer.visible = params.displayBVH;

        const physicsSteps = params.physicsSteps;

        for (let i = 0; i < physicsSteps; i++) {

            updatePlayer(delta / physicsSteps);

        }

    }

    // TODO: limit the camera movement based on the collider
    // raycast in direction of camera and move it if it's further than the closest point

    controls.update();

    renderer.render(scene, camera);

}