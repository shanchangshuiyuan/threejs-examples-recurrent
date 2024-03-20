import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
// import * as dat from 'lil-gui'
import Stats from 'three/examples/jsm/libs/stats.module.js'
import { Octree } from 'three/examples/jsm/math/Octree.js'
import { OctreeHelper } from 'three/examples/jsm/helpers/OctreeHelper.js'
import { Capsule } from 'three/examples/jsm/math/Capsule.js'
import { GUI } from 'three/examples/jsm/libs/lil-gui.module.min.js'

/**
 * Base
 */
// Debug
// const gui = new dat.GUI()

const clock = new THREE.Clock();

// Canvas
const canvas = document.querySelector('canvas.webgl');

/**
 * Sizes
 */
const sizes = {
    width: window.innerWidth,
    height: window.innerHeight
}


// Scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x88ccee);
scene.fog = new THREE.Fog(0x88ccee, 0, 50);

/**
 * Camera
 */
// Base camera
const camera = new THREE.PerspectiveCamera(75, sizes.width / sizes.height, 0.1, 1000);
camera.rotation.order = 'YXZ';
scene.add(camera);

// Controls
// const controls = new OrbitControls(camera, canvas);
// controls.enableDamping = true;


const fillLight1 = new THREE.HemisphereLight(0x8dc1de, 0x00668d, 1.5);
fillLight1.position.set(2, 1, 1);
scene.add(fillLight1);

const directionalLight = new THREE.DirectionalLight(0xffffff, 2.5);
directionalLight.position.set(- 5, 25, - 1);
directionalLight.castShadow = true;
directionalLight.shadow.camera.near = 0.01;
directionalLight.shadow.camera.far = 500;
directionalLight.shadow.camera.right = 30;
directionalLight.shadow.camera.left = - 30;
directionalLight.shadow.camera.top = 30;
directionalLight.shadow.camera.bottom = - 30;
directionalLight.shadow.mapSize.width = 1024;
directionalLight.shadow.mapSize.height = 1024;
directionalLight.shadow.radius = 4;
directionalLight.shadow.bias = - 0.00006;
scene.add(directionalLight);


/**
 * Renderer
 */
const renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    antialias: true
})
renderer.setSize(sizes.width, sizes.height);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.VSMShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const stats = new Stats();
stats.domElement.style.position = 'absolute';
stats.domElement.style.top = '0px';
document.body.appendChild(stats.domElement);



// 设置重力常量
const GRAVITY = 30;

// 设置球体数量、半径
const NUM_SPHERES = 100;
const SPHERE_RADIUS = 0.2;

// 每帧步数
const STEPS_PER_FRAME = 5;

// 创建球体几何体和材质
const sphereGeometry = new THREE.IcosahedronGeometry(SPHERE_RADIUS, 5);
const sphereMaterial = new THREE.MeshLambertMaterial({ color: 0xdede8d });

// 存储所有球体的数组
const spheres = [];
let sphereIdx = 0;

// 创建球体并添加到场景中
for (let i = 0; i < NUM_SPHERES; i++) {

    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
    sphere.castShadow = true;
    sphere.receiveShadow = true;

    scene.add(sphere);

    // 存储球体对象及其碰撞体和速度信息
    spheres.push({
        mesh: sphere,
        collider: new THREE.Sphere(new THREE.Vector3(0, - 100, 0), SPHERE_RADIUS),
        velocity: new THREE.Vector3()
    });

}

// 创建Octree用于场景中的碰撞检测
// Octree 是一种数据结构，用于高效地进行空间划分和碰撞检测。在这里，它被用于对场景中的碰撞体进行管理和检测。
const worldOctree = new Octree();

// 创建玩家碰撞体
// 这里使用了 Capsule（胶囊体）对象，通过两个端点和半径来定义一个胶囊体，这通常用于描述游戏中的角色或物体的碰撞体积。
const playerCollider = new Capsule(new THREE.Vector3(0, 0.35, 0), new THREE.Vector3(0, 1, 0), 0.35);

// 玩家速度和方向向量
const playerVelocity = new THREE.Vector3();
const playerDirection = new THREE.Vector3();

// 玩家是否在地面上
let playerOnFloor = false;
// 鼠标按下的时间
let mouseTime = 0;

// 按键状态存储对象
const keyStates = {};

// 临时向量对象
const vector1 = new THREE.Vector3();
const vector2 = new THREE.Vector3();
const vector3 = new THREE.Vector3();

// 监听按键按下事件
document.addEventListener('keydown', (event) => {

    // 这样做的目的是跟踪用户按下的键，以便在游戏中处理相应的用户输入
    keyStates[event.code] = true;

});

// 监听按键释放事件
document.addEventListener('keyup', (event) => {

    keyStates[event.code] = false;

});

// 监听鼠标按下事件
canvas.addEventListener('mousedown', () => {

    // 调用 requestPointerLock() 方法，将鼠标锁定到文档的元素上，这样可以确保鼠标移动不会离开元素区域。
    document.body.requestPointerLock();

    // 然后，它记录了鼠标按下的时间，以便后续的逻辑使用。
    mouseTime = performance.now();
})

document.addEventListener('mouseup', () => {

    // 首先检查当前文档中是否存在已经被指针锁定的元素
    if (document.pointerLockElement !== null) throwBall();

});


document.body.addEventListener('mousemove', (event) => {

    // 这个回调函数首先检查当前文档中是否存在已经被指针锁定的元素,则根据鼠标移动的距离调整相机的旋转角度
    if (document.pointerLockElement === document.body) {

        // 实现第一人称视角的鼠标控制
        camera.rotation.y -= event.movementX / 500;
        camera.rotation.x -= event.movementY / 500;

    }

});

window.addEventListener('resize', onWindowResize);

function onWindowResize() {

    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

    renderer.setSize(window.innerWidth, window.innerHeight);

}

function throwBall() {

    //从球体数组 spheres 中获取当前需要抛出的球体对象，通过 sphereIdx 变量来确定当前球体的索引。
    const sphere = spheres[sphereIdx];

    // 使用 Three.js 中的相机对象 camera 的方法 getWorldDirection()，
    // 获取相机正方向的单位向量，并存储在 playerDirection 变量中。这个向量指示了相机面向的方向。
    camera.getWorldDirection(playerDirection);

    //将当前球体的碰撞体中心位置设置为玩家碰撞体的末端位置，并沿着相机正方向（playerDirection）的方向，
    // 以玩家碰撞体半径的 1.5 倍距离进行偏移。这个操作会将球体的位置设置在玩家面前一定距离处，用于模拟玩家抛出球体的动作。
    sphere.collider.center.copy(playerCollider.end).addScaledVector(playerDirection, playerCollider.radius * 1.5);

    // throw the ball with more force if we hold the button longer, and if we move forward
    // 冲量的大小根据鼠标按下的时间长短而变化，按下时间越长，冲量越大。
    // 这里使用了指数衰减函数来计算冲量，使得按键按下时间越长，冲量增加得越快。
    const impulse = 15 + 30 * (1 - Math.exp((mouseTime - performance.now()) * 0.001));

    // 将球体的速度设置为相机正方向的单位向量（playerDirection）乘以冲量（impulse）。这样做使得球体沿着相机正方向抛出，并且速度大小与冲量相关。
    sphere.velocity.copy(playerDirection).multiplyScalar(impulse);
    // 将玩家的速度（playerVelocity）乘以 2，然后加到球体的速度上。这个操作是为了模拟玩家抛球时的运动，使得球体的速度在抛出方向上增加一定的额外速度。
    sphere.velocity.addScaledVector(playerVelocity, 2);

    // 更新 sphereIdx 变量，使其指向下一个球体，以便下一次抛球时使用不同的球体对象。
    sphereIdx = (sphereIdx + 1) % spheres.length;

}

// 处理玩家与场景中其他物体碰撞
function playerCollisions() {

    // 利用场景中的 Octree（八叉树）数据结构，检测玩家碰撞体 playerCollider 与场景中的物体是否发生碰撞，返回碰撞检测结果。
    const result = worldOctree.capsuleIntersect(playerCollider);

    // 变量用于标记玩家是否处于地面上
    playerOnFloor = false;

    if (result) {

        // 检测碰撞法线方向，如果法线方向的 y 分量大于 0，则表示玩家在地面上，将 playerOnFloor 设置为 true。
        playerOnFloor = result.normal.y > 0;

        // 如果玩家不在地面上，则对玩家的速度进行修正，使其沿着碰撞法线方向反弹。
        if (!playerOnFloor) {

            // result.normal 表示碰撞法线的方向，- result.normal.dot(playerVelocity) 表示玩家速度在法线方向上的分量，
            // 这个分量乘以 -1 实现反向。然后通过 addScaledVector 方法将这个反弹方向的速度分量添加到玩家的速度上。
            playerVelocity.addScaledVector(result.normal, - result.normal.dot(playerVelocity));

        }

        // 将玩家碰撞体根据碰撞的深度（result.depth）进行移动，确保玩家不会穿过场景中的物体。
        playerCollider.translate(result.normal.multiplyScalar(result.depth));

    }

}


function updatePlayer(deltaTime) {

    // 这一行计算了一个阻尼系数（damping），用于模拟空气阻力对玩家速度的影响。
    let damping = Math.exp(- 4 * deltaTime) - 1;

    if (!playerOnFloor) {

        // 首先将玩家的垂直速度根据重力进行调整，模拟玩家在空中受到重力的影响。
        playerVelocity.y -= GRAVITY * deltaTime;

        // 对于不在地面上的情况，将阻尼系数（damping）乘以 0.1，以模拟空气阻力
        // 对玩家的影响。这样做是为了让空中移动时的阻尼效果比地面移动时要小。
        // small air resistance
        damping *= 0.1;

    }

    // 这一行将计算得到的阻尼系数应用到玩家的速度上。
    playerVelocity.addScaledVector(playerVelocity, damping);

    //这一行计算了玩家在当前帧中的位移量（deltaPosition)
    // 通过将玩家的速度向量（playerVelocity）克隆一份，并乘以时间步长（deltaTime），得到了玩家在当前帧中应该移动的距离。
    const deltaPosition = playerVelocity.clone().multiplyScalar(deltaTime);
    // 通过 translate 方法，将玩家的碰撞体相应地移动到新的位置，确保玩家的位置与其碰撞体保持同步。
    playerCollider.translate(deltaPosition);

    // 这一行调用了 playerCollisions() 函数，用于处理玩家与场景中其他物体的碰撞，以确保玩家在移动过程中能够正确地与环境进行交互。
    playerCollisions();

    // 通过 copy 方法，将玩家碰撞体的末端位置（通常表示玩家头部位置）复制给相机的位置，实现相机跟随玩家移动的效果。
    camera.position.copy(playerCollider.end);

}


// 这段代码涉及到处理球体之间的碰撞检测和碰撞响应
function playerSphereCollision(sphere) {

    // 计算玩家碰撞体的中心点坐标，这里采用了玩家碰撞体的起点和终点的中点。
    const center = vector1.addVectors(playerCollider.start, playerCollider.end).multiplyScalar(0.5);

    // 获取当前球体的中心点坐标
    const sphere_center = sphere.collider.center;

    // 计算球体之间的最小碰撞距离（r）以及其平方（r2）
    const r = playerCollider.radius + sphere.collider.radius;
    const r2 = r * r;

    // approximation: player = 3 spheres

    // 遍历玩家碰撞体的起点、终点和中心点，用于检测球体与玩家碰撞体的碰撞。
    for (const point of [playerCollider.start, playerCollider.end, center]) {

        // 计算球体中心点与当前遍历点之间的距离的平方。
        const d2 = point.distanceToSquared(sphere_center);

        // 判断球体与当前遍历点是否发生了碰撞
        if (d2 < r2) {

            // 计算碰撞法线向量，并根据法线向量调整球体和玩家的速度，实现碰撞后的反弹效果。
            // 调整球体的位置，防止球体之间发生穿透
            const normal = vector1.subVectors(point, sphere_center).normalize();
            const v1 = vector2.copy(normal).multiplyScalar(normal.dot(playerVelocity));
            const v2 = vector3.copy(normal).multiplyScalar(normal.dot(sphere.velocity));

            playerVelocity.add(v2).sub(v1);
            sphere.velocity.add(v1).sub(v2);

            // 通过球体半径和碰撞点距离计算碰撞后的压缩距离
            const d = (r - Math.sqrt(d2)) / 2;
            // 通过 addScaledVector 方法将法线方向的反向乘以压缩距离，并将结果添加到球体中心点位置上，实现了球体位置的调整
            sphere_center.addScaledVector(normal, - d);

        }

    }

}


// 检测和处理球体之间的碰撞
function spheresCollisions() {

    for (let i = 0, length = spheres.length; i < length; i++) {

        const s1 = spheres[i];

        for (let j = i + 1; j < length; j++) {

            const s2 = spheres[j];

            const d2 = s1.collider.center.distanceToSquared(s2.collider.center);
            const r = s1.collider.radius + s2.collider.radius;
            const r2 = r * r;

            if (d2 < r2) {

                const normal = vector1.subVectors(s1.collider.center, s2.collider.center).normalize();
                const v1 = vector2.copy(normal).multiplyScalar(normal.dot(s1.velocity));
                const v2 = vector3.copy(normal).multiplyScalar(normal.dot(s2.velocity));

                s1.velocity.add(v2).sub(v1);
                s2.velocity.add(v1).sub(v2);

                const d = (r - Math.sqrt(d2)) / 2;

                s1.collider.center.addScaledVector(normal, d);
                s2.collider.center.addScaledVector(normal, - d);

            }

        }

    }

}

// 更新场景中所有球体的位置
function updateSpheres(deltaTime) {

    spheres.forEach(sphere => {

        sphere.collider.center.addScaledVector(sphere.velocity, deltaTime);

        // 检测当前球体与场景中的物体是否发生了碰撞，返回碰撞结果。
        const result = worldOctree.sphereIntersect(sphere.collider);

        if (result) {

            sphere.velocity.addScaledVector(result.normal, - result.normal.dot(sphere.velocity) * 1.5);
            sphere.collider.center.add(result.normal.multiplyScalar(result.depth));

        } else {

            sphere.velocity.y -= GRAVITY * deltaTime;

        }

        const damping = Math.exp(- 1.5 * deltaTime) - 1;
        sphere.velocity.addScaledVector(sphere.velocity, damping);

        playerSphereCollision(sphere);

    });

    spheresCollisions();

    for (const sphere of spheres) {

        // 将每个球体的网格对象的位置更新为球体的中心点位置，以保持视觉上的一致性。
        sphere.mesh.position.copy(sphere.collider.center);

    }

}

// 获取玩家的前进方向向量，使其在 x-z 平面上，并确保其长度为 1，以便在游戏中进行移动和方向控制。
function getForwardVector() {

    // 这个方法返回相机的朝向向量，表示相机指向的方向
    camera.getWorldDirection(playerDirection);
    // 这一步的目的是将向量投影到 x-z 平面上，消除垂直方向上的影响，使其仅保留水平方向上的分量。
    playerDirection.y = 0;
    // 这一步确保了返回的向量是单位向量，方向保持不变但长度为 1，使其表示一个方向而不是具体的距离。
    playerDirection.normalize();

    return playerDirection;

}

function getSideVector() {

    camera.getWorldDirection(playerDirection);
    playerDirection.y = 0;
    playerDirection.normalize();
    // 使用向量的叉乘运算获取相机的右侧向量，即玩家的侧向向量。
    // 这一步将相机的上方向向量 camera.up 与归一化后的相机方向向量进行叉乘，得到的结果是相机方向向量和上方向向量的叉乘结果，即相机的右侧向量。
    playerDirection.cross(camera.up);

    return playerDirection;

}

function controls(deltaTime) {

    // gives a bit of air control
    const speedDelta = deltaTime * (playerOnFloor ? 25 : 8);

    if (keyStates['KeyW']) {

        playerVelocity.add(getForwardVector().multiplyScalar(speedDelta));

    }

    if (keyStates['KeyS']) {

        playerVelocity.add(getForwardVector().multiplyScalar(- speedDelta));

    }

    if (keyStates['KeyA']) {

        playerVelocity.add(getSideVector().multiplyScalar(- speedDelta));

    }

    if (keyStates['KeyD']) {

        playerVelocity.add(getSideVector().multiplyScalar(speedDelta));

    }

    if (playerOnFloor) {

        if (keyStates['Space']) {

            playerVelocity.y = 15;

        }

    }

}

const loader = new GLTFLoader().setPath('./models/gltf/');

loader.load('collision-world.glb', (gltf) => {

    scene.add(gltf.scene);

    //使用场景对象初始化Octree数据结构，以便进行碰撞检测。
    // fromGraphNode 是 Octree 的方法，用于从场景图节点构建 Octree
    worldOctree.fromGraphNode(gltf.scene);

    gltf.scene.traverse(child => {

        if (child.isMesh) {

            child.castShadow = true;
            child.receiveShadow = true;

            if (child.material.map) {

                child.material.map.anisotropy = 4;

            }

        }

    });

    // 这段代码主要是创建一个 OctreeHelper 对象，用于在场景中显示 Octree 的辅助线框，并将其添加到场景中。
    const helper = new OctreeHelper(worldOctree);
    helper.visible = false;
    scene.add(helper);

    const gui = new GUI({ width: 200 });
    gui.add({ debug: false }, 'debug')
        .onChange(function (value) {

            helper.visible = value;

        });

    animate();

});

// 其作用是在玩家位置超出边界时将玩家传送回到指定位置。
function teleportPlayerIfOob() {

    if (camera.position.y <= - 25) {

        playerCollider.start.set(0, 0.35, 0);
        playerCollider.end.set(0, 1, 0);
        playerCollider.radius = 0.35;
        camera.position.copy(playerCollider.end);
        camera.rotation.set(0, 0, 0);

    }

}

function animate() {

    const deltaTime = Math.min(0.05, clock.getDelta()) / STEPS_PER_FRAME;

    // we look for collisions in substeps to mitigate the risk of
    // an object traversing another too quickly for detection.

    for (let i = 0; i < STEPS_PER_FRAME; i++) {

        controls(deltaTime);

        updatePlayer(deltaTime);

        updateSpheres(deltaTime);

        teleportPlayerIfOob();

    }

    renderer.render(scene, camera);

    stats.update();

    requestAnimationFrame(animate);

}


animate()