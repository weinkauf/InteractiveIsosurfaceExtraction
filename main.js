import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';

var Settings = {};

///////////////// The Data Cubes and their display variables //////////////////
const DataCubes = //x-fastest
[
    [3, 2, 2, -2, -1, 3, 1, 2],
    [3, 2, 3, 2, -2, -1, 2, -1],
    [-3, 4, 1, -2, -2, -2, 2, 2],
    [3, 2, -2, 1, 2, 2, 1, -2],
    [3, 2, -1, 2, 2, 2, 2, -1],
    [1, -2, -2, 1, -2, 1, 1, -2],
    [6, -2, -2, 1, -2, 6, 1, -2],
    [4, -2, -2, 1, -1, 2, 1, -2],
    [3, -4, -2, 1, 2, 2, 1, -2]
];


let FontName = 'helvetiker'; // helvetiker, optimer, gentilis, droid sans, droid serif
let FontWeight = 'regular'; // regular bold
let Font = undefined;
const VoxelValues = new THREE.Group();
Settings["CurrentDataCube"] = 1;

const CylinderThickness = 0.02;
const SphereRadius = 0.04;

///////////// Camera, Lights, Controls, User Interaction ////////////////

let camera, scene, renderer, controls;
let directionalLight;
let pointer, raycaster;

let bControlInteraction = false;
let isShiftDown = false, isCtrlDown = false;
let LastMouseMoveEvent;

//What we hit during an intersection test
const HitType = Object.freeze(
                {
                    None:       Symbol("None"),
                    Cylinder:   Symbol("Cylinder"),
                    UserPoint:  Symbol("UserPoint"),
                    UserLine:   Symbol("UserLine")
                });

//Contains the edges and vertices of the main voxel.
//A transformations will be applied to the whole voxel, that's why the grouping.
const Voxel = new THREE.Group();
//A list of just the cylinders in the voxel, for intersection purposes.
let VoxelCylinders = [];

//A set of points along the edges that have been added by the user.
let UserAddedPoints = new THREE.Group();
//A point indicating the position of the mouse pointer over an edge, ready to be added.
let NewPointHalo;
//A point selected by the user via hovering with the mouse over it. We do not have persistent selection, just fleeting.
let SelectedPoint = undefined;
//Start and end of a dragging operation to connect two points.
let DragStartPoint = undefined;
let DragEndPoint= undefined;
//A set of lines added by the user via connecting two user-defined points.
let UserAddedLines = new THREE.Group();
//A line indicating where a new line would be added while dragging
let NewLineHalo;
let SelectedLine = undefined;

//A voxel, invisible to the user, but used for raycasting/picking when dragging lines.
let InvisibleVoxel = undefined;

////////////////////////////// Solution /////////////////////////////////

let SolutionRegular = new THREE.Group();
let SolutionHighRes = new THREE.Group();

//////////////////////////// Data Storage ///////////////////////////////

let LastDataCube = 0;
let StorageUserAddedPoints = new Array();
for (let i=0;i<DataCubes.length;i++) {StorageUserAddedPoints[i] = [];}
let StorageUserAddedLines = new Array();
for (let i=0;i<DataCubes.length;i++) {StorageUserAddedLines[i] = [];}

///////////////////////////// Materials /////////////////////////////////

const MaterialLightGray = new THREE.MeshPhongMaterial({ color: 0xAAAAAA });
const MaterialDarkGray = new THREE.MeshPhongMaterial({ color: 0x777777 });
const MaterialTextNormal = new THREE.MeshPhongMaterial({ color: 0x774444 });
const MaterialUserPoint = new THREE.MeshPhongMaterial({ color: 0xAAAADD });
const MaterialUserPointHit = new THREE.MeshPhongMaterial({ color: 0x5050b9 });
const MaterialUserPointDel = new THREE.MeshPhongMaterial({ color: 0xb95050 });
const MaterialUserPointConnect = new THREE.MeshPhongMaterial({ color: 0x50b950 });
const MaterialHaloPoint = new THREE.MeshPhongMaterial(
{
    color: 0xAAAAAA,
    opacity: 0.75,
    transparent: true
});
const MaterialUserLine = new LineMaterial({ color: 0xAAAADD, linewidth: 5 });
const MaterialUserLineHit = new LineMaterial({ color: 0x5050b9, linewidth: 5 });
const MaterialUserLineDel = new LineMaterial({ color: 0xb95050, linewidth: 5 });
const MaterialUserLineDrag = new LineMaterial({ color: 0x50b950, linewidth: 5, dashed: true,
		dashSize: 2,
		gapSize: 4
    });//dashing does not work
MaterialUserLineDrag.resolution.set(window.innerWidth, window.innerHeight);
MaterialUserLineDrag.defines.USE_DASH = "";
const MaterialSolutionRegular = new THREE.MeshPhongMaterial({ color: 0xc76502 });
const MaterialSolutionRegularLine = new LineMaterial({ color: 0xc76502, linewidth: 5 });
const MaterialSolutionHighRes = new THREE.MeshStandardMaterial(
{
    color: 0xfbc503,
    metalness: 0.3,
    roughness: 0.7,
    side: THREE.DoubleSide // disable backface culling
});

    
init();
render();


function LoadFont()
{
    const Loader = new FontLoader();
    Loader.load('fonts/' + FontName + '_' + FontWeight + '.typeface.json', function(response)
    {
        Font = response;
        CreateText();
    });
}

function CreateText()
{
    //Safety
    if (Font === undefined) return;
    const idCube = Settings.CurrentDataCube - 1; //The UI shows it 1-indexed.
    if (idCube < 0 || idCube >= DataCubes.length) return;

    //Get the current cube's values
    const Values = DataCubes[idCube];
    let idValue = 0;

    const TextScale = 0.1;
    for (const z of [0, 1])
    {
        for (const y of [0, 1])
        {
            for (const x of [0, 1])
            {
                const TextGeo = new TextGeometry(Values[idValue].toString(),
                {
                    font: Font,
                    size: 1 * TextScale,
                    depth: 0.1 * TextScale,
                    curveSegments: 4,
                    bevelThickness: 0.05,
                    bevelSize: 0.025,
                    bevelEnabled: false
                });
                idValue++;

                const TextMesh = new THREE.Mesh(TextGeo, MaterialTextNormal);

                //Center the text around the origin before rotation
                TextGeo.computeBoundingBox();
                let Center = new THREE.Vector3();
                TextGeo.boundingBox.getCenter(Center);
                Center.multiplyScalar(-1);
                TextMesh.position.copy(Center);

                //The auxilliary parent rotates to the viewer, then translates to the corner.
                const TextMeshParent = new THREE.Group();
                const CornerPos = new THREE.Vector3(x, y, z);
                CornerPos.addScalar(-0.5);
                CornerPos.multiplyScalar(1.1);
                TextMeshParent.position.copy(CornerPos);
                TextMeshParent.add(TextMesh);

                VoxelValues.add(TextMeshParent);
            }
        }
    }

    scene.add(VoxelValues);
    render();
}

function RefreshCube()
{
    const idCube = Settings.CurrentDataCube - 1; //The UI shows it 1-indexed.
    if (idCube < 0 || idCube >= DataCubes.length) return;

    //Save user-added geometry for the previous DataCube
    StorageUserAddedPoints[LastDataCube] = UserAddedPoints.children;
    StorageUserAddedLines[LastDataCube] = UserAddedLines.children;

    //Load new user-added geometry
    UserAddedPoints.children = StorageUserAddedPoints[idCube];
    UserAddedLines.children = StorageUserAddedLines[idCube];

    //Make the correct solution visible. Its actual visibility depends on its parent.
    SolutionRegular.children.forEach(child =>
    {
        child.visible = (child.userData === idCube);
    });
    SolutionHighRes.children.forEach(child =>
    {
        child.visible = (child.userData === idCube);
    });


    LastDataCube = idCube;

    //Create the new text for the numbers at the corner
    if (Font !== undefined)
    {
        //Free memory
        VoxelValues.children.forEach(c => {c.children[0].geometry.dispose();});
        VoxelValues.children.length = 0;
        scene.remove(VoxelValues);

        CreateText();
    }
}

function CreateGeometry()
{
    //const axesHelper = new THREE.AxesHelper(1);
    //scene.add(axesHelper);

    ////////////// Edges of the Voxel as Cylinders //////////////////
    const XAxis = new THREE.Vector3(1, 0, 0);
    const YAxis = new THREE.Vector3(0, 1, 0);
    const ZAxis = new THREE.Vector3(0, 0, 1);
    
    const Quaternion = new THREE.Quaternion();
    const Translation = new THREE.Vector3();
    //The Cylinder starts parallel to the y axis. To make it parallel to the x axis, we rotate it by 90 degrees around the z axis.
    //From left to right: horizontal (x), vertical (y), depth (z)
    for (const Arrangement of [[ZAxis, YAxis, ZAxis, XAxis], [YAxis, XAxis, ZAxis, YAxis], [XAxis, XAxis, YAxis, ZAxis]])
    {
        const Axis = Arrangement[0];
        Quaternion.setFromAxisAngle(Axis, Math.PI/2);

        const TAxis1 = Arrangement[1];
        const TAxis2 = Arrangement[2];
        const TAxis3 = Arrangement[3];
        for (const i of [0, 1])
        {
            for (const j of [0, 1])
            {
                const Geometry = new THREE.CylinderGeometry(CylinderThickness, CylinderThickness);
                const Cylinder = new THREE.Mesh(Geometry, MaterialLightGray);
                Cylinder.quaternion.copy(Quaternion);
                Cylinder.position.copy(TAxis1.clone().multiplyScalar(i).add(
                                       TAxis2.clone().multiplyScalar(j).add(
                                       TAxis3.clone().multiplyScalar(0.5)
                                      )));

                //These points are rather hardcoded including the later movement of the voxel and such.
                const MinEdgePoint = new THREE.Vector3();
                MinEdgePoint.copy(TAxis1.clone().multiplyScalar(i-0.5).add(
                                  TAxis2.clone().multiplyScalar(j-0.5).add(
                                  TAxis3.clone().multiplyScalar(-0.5)
                                 )));
                const MaxEdgePoint = new THREE.Vector3();
                MaxEdgePoint.copy(TAxis1.clone().multiplyScalar(i-0.5).add(
                                  TAxis2.clone().multiplyScalar(j-0.5).add(
                                  TAxis3.clone().multiplyScalar(0.5)
                                 )));

                Cylinder.userData = {min: MinEdgePoint, max: MaxEdgePoint};
                
                Voxel.add(Cylinder);
            }
        }
    }
    
    ////////////// Corners of the Voxel as Cylinders //////////////////
    for (const x of [0, 1])
    {
        for (const y of [0, 1])
        {
            for (const z of [0, 1])
            {
                const Geometry = new THREE.SphereGeometry(SphereRadius);
                const Sphere = new THREE.Mesh(Geometry, MaterialLightGray);
                Sphere.position.set(x, y, z);
                Voxel.add(Sphere);
            }
        }
    }

    /////////////////// Text on Corners ////////////////////
    LoadFont();
    
    //Center the voxel around the origin
    Voxel.position.set(-0.5, -0.5, -0.5);
    scene.add(Voxel);

    //Parts of the voxel will be used for intersection tests.
    VoxelCylinders = Voxel.children.filter(obj => { return obj.geometry instanceof THREE.CylinderGeometry; });
    
    //////////////// Invisible Geometry //////////////////
    //Cube for dragging lines. We look for intersections with its faces.
    const BoxGeo = new THREE.BoxGeometry(1, 1, 1);
    const BoxMat = new THREE.MeshBasicMaterial( {color: 0x00ff00} ); 
    InvisibleVoxel = new THREE.Mesh(BoxGeo, BoxMat);
    //Note, how it is not added to the scene.

    ////////////// Sphere indicating new Intersection Point ///////////
    const HaloGeo = new THREE.SphereGeometry(SphereRadius);
    NewPointHalo = new THREE.Mesh(HaloGeo, MaterialHaloPoint);
    NewPointHalo.visible = false;
    scene.add(NewPointHalo);
    
    ////////////// Line indicating new Intersection Line ///////////
    const Points = [];
    Points.push(0, 0, 0);
    Points.push(1, 1, 1);
    const NewLineHaloGeo = new LineGeometry();
    NewLineHaloGeo.setPositions(Points);
    NewLineHalo = new Line2(NewLineHaloGeo, MaterialUserLineDrag);
    NewLineHalo.visible = false;
    scene.add(NewLineHalo);
    MaterialUserLineDrag.resolution.set(window.innerWidth, window.innerHeight);
    
    //////////////// User-added Geometry //////////////////
    scene.add(UserAddedPoints);
    scene.add(UserAddedLines);

    //////////////////// Solutions ////////////////////////

    //Compute regular solutions
    scene.add(SolutionRegular);
    SolutionRegular.visible = false;
    ComputeRegularSolutions();

    // Load high-res solutions from disk / network,
    // give them an appropriate material, position them,
    // and make them invisible.
    scene.add(SolutionHighRes);
    SolutionHighRes.visible = false;
    const Loader = new OBJLoader();
    for(let i=1;i<=9;i++)
    {
        Loader.load('cubes/Cube0' + i + '.obj', (obj) =>
        {
            obj.traverse((child) =>
            {
                if (child.isMesh) child.material = MaterialSolutionHighRes;
            });

            obj.position.set(-0.5, -0.5, -0.5);
            obj.visible = (i === 1); //Selectively switched on later
            obj.userData = (i-1);
            SolutionHighRes.add(obj);
        },
        undefined, function (error)
        {
            console.error(error);
        });
    }
}

function ComputeRegularSolutions()
{
    const a = -0.5;
    const b = 0.5;
    const Vertices =
    [
        new THREE.Vector3(a,a,a),
        new THREE.Vector3(b,a,a),
        new THREE.Vector3(a,b,a),
        new THREE.Vector3(b,b,a),
        new THREE.Vector3(a,a,b),
        new THREE.Vector3(b,a,b),
        new THREE.Vector3(a,b,b),
        new THREE.Vector3(b,b,b)
    ];

    const Edges =
    [
        [0, 1], [0, 2], [1, 3], [2, 3], //front
        [0, 4], [1, 5], [2, 6], [3, 7], //side
        [4, 5], [4, 6], [5, 7], [6, 7]  //back
    ];

    //Enumeration hardly matters, just that the right edges are grouped.
    //Based on a 6-sided die laying in front of me right now...
    const EdgeToFaces =
    [
        //front edges
        [0, 2],
        [0, 1],
        [0, 4],
        [0, 3],

        //side edges
        [1, 2],
        [2, 4],
        [1, 3],
        [3, 4],

        //back edges
        [2, 5],
        [1, 5],
        [4, 5],
        [3, 5]
    ];

    for (const [idCube, d] of DataCubes.entries())
    {
        let IntersectionPoints = [];
        let Faces = [[],[],[],[],[],[]];
        let FaceAsymptoticSort = [0, 2, 0, 0, 2, 0];

        //Put the solution for this cube in a new group
        const ThisSolution = new THREE.Group();
        SolutionRegular.add(ThisSolution);
        ThisSolution.visible = (idCube === 0);
        ThisSolution.userData = idCube;

        //Find intersection points with edges
        for (const [i, e] of Edges.entries())
        {
            //Data and position of vertices of this edge
            const u = d[e[0]];
            const v = d[e[1]];
            const upos = Vertices[e[0]];
            const vpos = Vertices[e[1]];

            //Will a linear interpolation along this edge hit the isovalue?
            // if ((u-isovalue) * (v-isovalue) <= 0) //general approach
            if (u*v <= 0) //our isovalue is zero
            {
                //Calculate position of isocontour intersection on this edge
                const t = u / (u-v); //(isovalue-u) / (v-u);
                IntersectionPoints.push(new THREE.Vector3().lerpVectors(upos, vpos, t));
                Faces[EdgeToFaces[i][0]].push(IntersectionPoints.length-1);
                Faces[EdgeToFaces[i][1]].push(IntersectionPoints.length-1);
            }
        }

        //Draw the intersection points as spheres
        for (const p of IntersectionPoints)
        {
            const Geometry = new THREE.SphereGeometry(SphereRadius);
            const Sphere = new THREE.Mesh(Geometry, MaterialSolutionRegular);
            Sphere.position.copy(p);
            ThisSolution.add(Sphere);
        }

        //Connect the intersection points on each face
        for (let [i, f] of Faces.entries())
        {
            if (f.length > 1)
            {
                const idSort = FaceAsymptoticSort[i];
                //Sort for asymptotic decider.
                //The regular case does not mind being sorted either.
                f.sort(function(a, b) { return (IntersectionPoints[a].getComponent(idSort) - IntersectionPoints[b].getComponent(idSort)); });

                for(let j=0;j<f.length;j+=2)
                {
                    const idA = f[j];
                    const idB = f[j+1];

                    const Points = [];
                    Points.push(IntersectionPoints[idA].x, IntersectionPoints[idA].y, IntersectionPoints[idA].z);
                    Points.push(IntersectionPoints[idB].x, IntersectionPoints[idB].y, IntersectionPoints[idB].z);
                    const LineGeo = new LineGeometry();
                    LineGeo.setPositions(Points);
                    const Line = new Line2(LineGeo, MaterialSolutionRegularLine);
                    ThisSolution.add(Line);
                }
            }
        }
    }
}

function CreateUI()
{
    const SuperSecretPassword = "Tino";

    const gui = new GUI({title: "Interactive Isosurface Extraction"});

    gui.add(Settings, "CurrentDataCube", [1, 2, 3, 4, 5, 6, 7, 8, 9])
       .name("Example")
       .onChange(RefreshCube);

    Settings["ResetCamera"] = function() {controls.reset();};
    gui.add(Settings, "ResetCamera");

    const SolutionFolder = gui.addFolder("Solution").close();

    Settings["Password"] = "";
    SolutionFolder.add(Settings, "Password")
                  .onChange(value =>
                  {
                      let b = (value === SuperSecretPassword);
                      if (!b) SolutionRegularCheckbox.setValue(b);
                      if (!b) SolutionHighResCheckbox.setValue(b);
                      SolutionRegularCheckbox.enable(b);
                      SolutionHighResCheckbox.enable(b);
                  });

    Settings["Show Solution"] = SolutionRegular.visible;
    let SolutionRegularCheckbox =
    SolutionFolder.add(Settings, "Show Solution")
                  .disable()
                  .onChange(value => {SolutionRegular.visible = value; render();});

    Settings["Show HighRes Solution"] = SolutionHighRes.visible;
    let SolutionHighResCheckbox =
    SolutionFolder.add(Settings, "Show HighRes Solution")
                  .disable()
                  .onChange(value => {SolutionHighRes.visible = value; render();});
}


function init()
{
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);

    CreateGeometry();
    
    //Picking
    raycaster = new THREE.Raycaster();
    pointer = new THREE.Vector2();

    //Camera
    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 10000);
    camera.position.set(2, 1, 2.5);
    camera.lookAt(0, 0, 0);
    scene.add(camera);
    
    //Light - ambient
    const ambientLight = new THREE.AmbientLight(0x606060, 3);
    scene.add(ambientLight);
    //Light - directional following the camera
    directionalLight = new THREE.DirectionalLight(0xffffff, 5);
    directionalLight.position.copy(camera.position);
    directionalLight.position.x+=0;
    directionalLight.position.y+=1;
    directionalLight.position.z+=0;
    camera.add(directionalLight);

    renderer = new THREE.WebGLRenderer(
    {
        antialias: true
    });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    //Camera controls
    controls = new OrbitControls(camera, renderer.domElement);
    //~ controls.listenToKeyEvents( window ); // optional
    controls.addEventListener('change', render); // call this only in static scenes (i.e., if there is no animation loop)
    controls.addEventListener('start', function(){bControlInteraction = true;});
    controls.addEventListener('end', function(){bControlInteraction = false;});
    //~ controls.enableDamping = true; // an animation loop is required when either damping or auto-rotation are enabled
    //~ controls.dampingFactor = 0.05;
    controls.enablePan = false;
    //~ controls.screenSpacePanning = false;
    controls.minDistance = 2;
    controls.maxDistance = 5;
    controls.minPolarAngle = Math.PI / 8;
    controls.maxPolarAngle = Math.PI - Math.PI / 8;

    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('keydown', onDocumentKeyDown);
    document.addEventListener('keyup', onDocumentKeyUp);
    
    window.addEventListener('resize', onWindowResize);

    CreateUI();
}

function onWindowResize()
{
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    render();
}

function UpdateRaycaster(event)
{
    //Mouse pointer in normalized device units wrt. the canvas.
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ( (event.clientX - rect.left) / rect.width ) * 2 - 1;
    pointer.y = ( (event.clientY - rect.top) / rect.height ) * -2 + 1;
    
    raycaster.setFromCamera(pointer, camera);
}

function onPointerMove(event)
{
    //Show feedback for hovering over certain objects.
    //Add / remove objects in onPointerDown() according to the states defined here.
    //Only act if the user is not currently interacting with the camera controls.
    if (bControlInteraction) return;

    //This function is also called with keyboard events for KeyUp and KeyDown.
    //This allows to react to the Shift key wrt. deleting a point for example.
    if (event !== undefined) LastMouseMoveEvent = event;
    if (LastMouseMoveEvent === undefined) return;
    
    //Reset all materials
    for (const Obj of Voxel.children) { Obj.material = MaterialLightGray; }
    for (const Obj of UserAddedPoints.children) { Obj.material = MaterialUserPoint; }
    for (const Obj of UserAddedLines.children) { Obj.material = MaterialUserLine; }
    
    //We cast a ray into the scene from the mouse pointer, what does it hit?
    UpdateRaycaster(LastMouseMoveEvent);

    
    //Find the nearest cylinder/user point/user line hit by the raycaster
    const AllIntersects = raycaster.intersectObjects(VoxelCylinders.concat(UserAddedPoints.children, UserAddedLines.children), false);
    let NearestHit = undefined;
    let NearestType = HitType.None;
    if (AllIntersects.length > 0)
    {
        NearestHit = AllIntersects[0];
        if (NearestHit.object.geometry instanceof THREE.CylinderGeometry) NearestType = HitType.Cylinder;
        if (NearestHit.object.geometry instanceof THREE.SphereGeometry) NearestType = HitType.UserPoint;
        if (NearestHit.object.geometry instanceof LineGeometry) NearestType = HitType.UserLine;
    }


    //The halo is visible only, if we are in a state where we could add a new point.
    NewPointHalo.visible = (NearestHit !== undefined
                         && NearestType === HitType.Cylinder
                         && DragStartPoint === undefined);

    //////////////////////////// Voxel Edges ////////////////////////////
    if (NearestType === HitType.Cylinder)
    {
        //We got a hit on an edge. Highlight the edge.
        NearestHit.object.material = MaterialDarkGray;
        
        if (NewPointHalo.visible)
        {
            //Compute a point PERFECTLY on the edge. The hit point is on the outside of the cylinder.
            const a = NearestHit.object.userData.min;
            const b = NearestHit.object.userData.max;
            const c = NearestHit.point;
            const t = a.distanceTo(c) / a.distanceTo(b);
            const ShowPos = new THREE.Vector3();
            ShowPos.copy(b).sub(a).multiplyScalar(t).add(a);
            
            NewPointHalo.position.copy(ShowPos);
        }
    }

    //////////////////////////// User Points ////////////////////////////
    if (NearestType === HitType.UserPoint)
    {
        //Save the selected point in a global variable to be used for interactions in onPointerDown().
        SelectedPoint = NearestHit.object;
        
        //We got a hit on a user-added point. Highlight it accordingly.
        if (isCtrlDown && isShiftDown)
        {
            //Press to delete this point
            SelectedPoint.material = MaterialUserPointDel;
        }
        else if (isCtrlDown && !isShiftDown)
        {
            //Drag to create a line connection between points
            SelectedPoint.material = MaterialUserPointConnect;
        }
        else
        {
            //We are simply just over the point.
            SelectedPoint.material = MaterialUserPointHit;
        }
    }
    else
    {
        SelectedPoint = undefined;
    }

    //////////////////////////// User Lines ////////////////////////////
    if (NearestType === HitType.UserLine)
    {
        //Save the selected line in a global variable to be used for interactions in onPointerDown().
        SelectedLine = NearestHit.object;

        SelectedLine.material = MaterialUserLineHit;
        if (isCtrlDown && isShiftDown)
        {
            //Press to delete this line
            SelectedLine.material = MaterialUserLineDel;
        }
    }
    else
    {
        SelectedLine = undefined;
    }
   
    //////////////////////////// Dragging ////////////////////////////
    if (DragStartPoint !== undefined && !isCtrlDown)
    {
        //Abort dragging operation
        DragStartPoint = undefined;
        NewLineHalo.visible = false;
    }
    
    if (DragStartPoint !== undefined && isCtrlDown)
    {
        //We are dragging a line from DragStartPoint to HaloEndPoint
        const HaloEndPoint = [];

        //The starting point of the drag remains in its selected/dragging material
        DragStartPoint.material = MaterialUserPointConnect;
        
        //Snap to another user-added point
        if (DragStartPoint !== SelectedPoint && SelectedPoint !== undefined)
        {
            //Create a line between these points, if the mouse button goes up again
            DragEndPoint = SelectedPoint;
            HaloEndPoint.push(DragEndPoint.position.x, DragEndPoint.position.y, DragEndPoint.position.z);
        }
        else
        {
            DragEndPoint = undefined;
        }

        //If we did not snap, we raycast to invisible faces of the cube to indicate a line
        if (HaloEndPoint.length === 0)
        {
            const BoxIntersects = raycaster.intersectObjects([InvisibleVoxel], false);
            if (BoxIntersects.length > 0)
            {
                HaloEndPoint.push(BoxIntersects[0].point.x, BoxIntersects[0].point.y, BoxIntersects[0].point.z);
            }
        }            

        //Draw the halo line
        if (HaloEndPoint.length > 0)
        {
            const Points = [];
            Points.push(DragStartPoint.position.x, DragStartPoint.position.y, DragStartPoint.position.z);
            Points.push(HaloEndPoint[0], HaloEndPoint[1], HaloEndPoint[2]);
            NewLineHalo.geometry.setPositions(Points);
            NewLineHalo.visible = true;
            NewLineHalo.computeLineDistances();
        }
    }
    
    render();
}

function onPointerDown(event)
{
    //Possibly add / remove objects.
    //Only act if the user is not currently interacting with the camera controls.
    if (bControlInteraction) return;

    if (NewPointHalo.visible && isCtrlDown && !isShiftDown)
    {
        //Add a new point where the halo point is.
        const NewPoint = NewPointHalo.clone();
        NewPoint.material = MaterialUserPoint;
        UserAddedPoints.add(NewPoint);
    }
    else if (SelectedLine !== undefined && isCtrlDown && isShiftDown)
    {
        //Delete the line
        SelectedLine.geometry.dispose();
        UserAddedLines.remove(SelectedLine);
        SelectedLine = undefined;
    }
    else if (SelectedPoint !== undefined && isCtrlDown && isShiftDown)
    {
        //Delete the point
        SelectedPoint.geometry.dispose();
        UserAddedPoints.remove(SelectedPoint);
        SelectedPoint = undefined;
    }
    else if (SelectedPoint !== undefined && isCtrlDown && !isShiftDown)
    {
        //Drag to create a connection between points
        DragStartPoint = SelectedPoint;
    }
    
    render();
}

function onPointerUp(event)
{
    //Possibly add lines between points.
    //Only act if the user is not currently interacting with the camera controls.
    if (bControlInteraction) return;

    //Add a line, if everything is well defined.
    if (DragStartPoint !== undefined && DragEndPoint !== undefined)
    {
        const Points = [];
        Points.push(DragStartPoint.position.x, DragStartPoint.position.y, DragStartPoint.position.z);
        Points.push(DragEndPoint.position.x, DragEndPoint.position.y, DragEndPoint.position.z);
        const LineGeo = new LineGeometry();
        LineGeo.setPositions(Points);
        const Line = new Line2(LineGeo, MaterialUserLine);
        UserAddedLines.add(Line);
    }

    //If the mouse pointer goes up, we end dragging in every case.
    DragStartPoint = undefined;
    DragEndPoint = undefined;
    NewLineHalo.visible = false;
    
    render();
}

function onDocumentKeyDown(event)
{
    switch (event.keyCode)
    {
        case 16:
            isShiftDown = true;
            break;
        case 17:
            isCtrlDown = true;
            break;
    }

    onPointerMove(undefined);
}

function onDocumentKeyUp(event)
{
    switch (event.keyCode)
    {
        case 16:
            isShiftDown = false;
            break;
        case 17:
            isCtrlDown = false;
            break;
    }
    
    onPointerMove(undefined);
}

function render()
{
    //The text shall face the viewer/camera.
    if (Font !== undefined) //only do this if text has been created, i.e., font has been loaded.
    {
        VoxelValues.children.forEach(c => {c.quaternion.copy(camera.quaternion);});
    }
    renderer.render(scene, camera);
}
