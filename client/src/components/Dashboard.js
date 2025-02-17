import React, { useRef, useState, useEffect } from "react";
import {
  Alert,
  Navbar,
  Container,
  Nav,
  Row,
  Col,
  Card,
  Form,
  Button,
} from "react-bootstrap";
import { useAuth } from "../contexts/AuthContext";
import { Link, useHistory } from "react-router-dom";
import axios from "axios";
import {
  savedReceivedDocAPI,
  savedIssuedDocIssuedAPI,
  savedIssuedDocCurrentAPI,
  cleanXlsxAPI,
} from "../functions/HelperFunctions";
import { RemarkModal } from "./RemarkModal";
import PuffLoader from "react-spinners/PuffLoader";
import * as XLSX from "xlsx";
import { Typeahead } from "react-bootstrap-typeahead";

export default function Dashboard() {
  const baseURL = "https://sy-custom-api-web-app.ts.r.appspot.com";

  const [options, setOptions] = useState([]);

  useEffect(() => {
    const jobs = [];
    var decodedAuth =
      process.env.REACT_APP_PROJECTWORKS_API_CONSUMER_KEY +
      ":" +
      process.env.REACT_APP_PROJECTWORKS_API_CONSUMER_SECRET;
    var encodedAuth = Buffer.from(decodedAuth).toString("base64");
    const promises = new Array(1).fill().map((v, i) =>
      fetch(
        `https://api.projectworksapp.com/api/v1.0/Projects?page=1&pageSize=20000&includeCustomFields=true`,
        {
          headers: {
            Authorization: "Basic " + encodedAuth,
          },
        }
      )
        .then((res) => res.json())
        .then((data) =>
          data.forEach((obj) => {
            var projectNumber = obj["ProjectNumber"];
            var projectName = obj["ProjectName"];
            var projectOffice = obj["CustomFields"][0]["Value"];
            if (projectOffice === null || projectOffice === "1") {
              projectOffice = "M";
            } else if (projectOffice === "2") {
              projectOffice = "A";
            }
            if (projectNumber.includes(".")) {
              jobs.push(
                projectNumber.substring(0, projectNumber.indexOf(".")) +
                  projectOffice +
                  " | " +
                  projectName
              );
            } else {
              jobs.push(projectNumber + projectOffice + " | " + projectName);
            }
          })
        )
    );
    setOptions(jobs);
  }, []);

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState("");
  const { currentUser, logout } = useAuth();
  const history = useHistory();

  async function handleLogout() {
    setError("");

    try {
      await logout();
      history.push("/login");
    } catch {
      setError("Failed to log out");
    }
  }

  const saveReceivedDocInput = useRef(null);
  const saveIssuedDocInput = useRef(null);
  const readXlsxFile = useRef(null);

  const [queriedJobFolder, setQueriedJobFolder] = useState(null);

  async function getJobID(name) {
    await axios
      .post(baseURL + "/getFolder", {
        q:
          "mimeType='application/vnd.google-apps.folder' and name='" +
          name +
          "'",
        fields: "files(name,id)",
      })
      .then(async (response) => {
        const myQueriedJobFolder = await response.data;
        await setQueriedJobFolder(myQueriedJobFolder);
        if (myQueriedJobFolder === null || myQueriedJobFolder.length === 0) {
          await setShowFileUploadSuccess(false);
          setFileUploadError("No job was found with that number");
          setShowFileUploadError(true);
        } else {
          await setShowFileUploadError(false);
          await setMessage("Job " + myQueriedJobFolder[0].name + " selected");
          await setShowFileUploadSuccess(true);
        }
      });
  }

  const [message, setMessage] = useState("");

  const [fileUploadError, setFileUploadError] = useState("");
  const [showFileUploadError, setShowFileUploadError] = useState(false);
  const [showFileUploadSuccess, setShowFileUploadSuccess] = useState(false);

  const [remarkData, setRemarkData] = useState("");

  async function saveReceivedDoc(subFolder, fileArrayFunc) {
    if (queriedJobFolder === null || queriedJobFolder.length === 0) {
      setFileUploadError(
        "No job selected. Please select a job before attempting to upload a file."
      );
      setShowFileUploadError(true);
      return;
    } else {
      await setShowFileUploadSuccess(false);
      await setLoading(true);
      await setRemarkData(
        await savedReceivedDocAPI(queriedJobFolder, subFolder, fileArrayFunc)
      );
      await handleShowRemarkModal();

      await setLoading(false);
      await setShowFileUploadError(false);
      await setMessage(
        "Successfully uploaded " + fileArrayFunc.length + " files"
      );
      await setShowFileUploadSuccess(true);
    }
  }

  async function saveIssuedDoc(fileArrayFunc) {
    if (queriedJobFolder === null || queriedJobFolder.length === 0) {
      setFileUploadError(
        "No job selected. Please select a job before attempting to upload a file."
      );
      setShowFileUploadError(true);
      return;
    } else {
      await setShowFileUploadSuccess(false);
      await setLoading(true);
      await setRemarkData(
        await savedIssuedDocIssuedAPI(queriedJobFolder, fileArrayFunc)
      );
      await savedIssuedDocCurrentAPI(queriedJobFolder, fileArrayFunc);
      await handleShowRemarkModal();

      await setLoading(false);
      await setShowFileUploadError(false);
      await setMessage(
        "Successfully uploaded " + fileArrayFunc.length + " files"
      );
      await setShowFileUploadSuccess(true);
    }
  }

  var xlsxItems = [];

  async function cleanXlsx(xlsxFile) {
    if (queriedJobFolder === null || queriedJobFolder.length === 0) {
      setFileUploadError(
        "No job selected. Please select a job before attempting to upload a file."
      );
      setShowFileUploadError(true);
      return;
    } else {
      await setShowFileUploadSuccess(false);
      await setLoading(true);
      await readExcel(xlsxFile);
      await cleanXlsxAPI(queriedJobFolder, await getFileList(xlsxItems));

      await setLoading(false);
      await setShowFileUploadError(false);
      await setMessage("Successfully uploaded cleaned files");
      await setShowFileUploadSuccess(true);
    }
  }

  async function readExcel(file) {
    const promise = new Promise(async (resolve, reject) => {
      const fileReader = new FileReader();
      fileReader.readAsArrayBuffer(file);

      fileReader.onload = async (e) => {
        const bufferArray = e.target.result;

        const wb = XLSX.read(bufferArray, { type: "buffer" });

        const wsname = wb.SheetNames[0];

        const ws = wb.Sheets[wsname];

        const data = XLSX.utils.sheet_to_json(ws);

        resolve(data);
      };

      fileReader.onerror = (error) => {
        reject(error);
      };
    });

    await promise.then(async (d) => {
      xlsxItems = d;
    });
  }

  async function getFileList(sheetItems) {
    var xlsxFileList = [];
    for (var i = 0; i < sheetItems.length; i++) {
      const objectArray = Object.values(sheetItems[i]);
      var xlsxFileName =
        queriedJobFolder[0].name +
        "_" +
        objectArray[0] +
        "_" +
        objectArray[1] +
        "_" +
        objectArray[2];
      xlsxFileList.push(xlsxFileName);
    }
    xlsxItems = [];
    return xlsxFileList;
  }

  const jobNumberRef = useRef();
  const [typeAheadValue, setTypeAheadValue] = useState("");

  function handleSelectJobSubmit(e) {
    e.preventDefault();
    if (typeAheadValue === "" && selected.length === 0) {
      setFileUploadError("Job field cannot be empty");
      setShowFileUploadError(true);
    } else if (typeAheadValue.length <= 5 && selected.length !== 0) {
      var jobIdSearch = selected[0].substring(0, selected[0].indexOf(" | "));
      getJobID(jobIdSearch);
    } else if (typeAheadValue.includes(" | ")) {
      setTypeAheadValue(
        typeAheadValue.substring(0, typeAheadValue.indexOf(" | "))
      );
      getJobID(typeAheadValue);
    } else {
      getJobID(typeAheadValue);
    }
  }

  function handleInputChange(input) {
    setTypeAheadValue(input);
  }

  const [receivedSubFolder, setReceivedSubFolder] = useState("");

  async function onChangeReceived(e) {
    if (e.target.files[0] !== null) {
      if (receivedSubFolder !== "") {
        await saveReceivedDoc(receivedSubFolder, e.target.files);
        setReceivedSubFolder("");
      }
    }
    e.target.value = null; // reset onChange
  }

  var issuedFiles = [];

  async function onChangeIssued(e) {
    if (e.target.files[0] !== null) {
      issuedFiles = await [];
      for (var i = 0; i < e.target.files.length; i++) {
        await issuedFiles.push(e.target.files[i]);
      }
      await saveIssuedDoc(issuedFiles);
      e.target.value = await null;
      // await document.getElementById("liveReadXlsxFile").click();
    }
  }

  async function onChangeXlsx(e) {
    if (e.target.files[0] !== null) {
      await cleanXlsx(e.target.files[0], issuedFiles);
    }
    issuedFiles = await [];
    e.target.value = await null;
  }

  function onButtonClickReceived() {
    saveReceivedDocInput.current.click();
  }

  function onButtonClickIssued() {
    saveIssuedDocInput.current.click();
  }

  function onButtonClickXlsx() {
    readXlsxFile.current.click();
  }

  const [showRemarkModal, setShowRemarkModal] = useState(false);
  const handleCloseRemarkModal = () => setShowRemarkModal(false);
  const handleShowRemarkModal = () => setShowRemarkModal(true);
  const [selected, setSelected] = useState([]);

  return (
    <>
      <RemarkModal
        show={showRemarkModal}
        onHide={handleCloseRemarkModal}
        remarkdata={remarkData}
      />
      <Navbar className="" style={{ minHeight: "7vh" }}>
        <Container style={{ minWidth: "97vw" }}>
          <Navbar.Brand>
            <img
              alt=""
              src="https://systructures.com.au/wp-content/uploads/2020/05/sy-logo.png"
              className="d-inline-block align-top"
            />{" "}
          </Navbar.Brand>
          <Nav className="mr-auto">
            <Nav.Link href="/update-profile">Update Profile</Nav.Link>
            <Nav.Link href="/signup">Add New User</Nav.Link>
            {/* <Nav.Link>Help</Nav.Link> */}
            <Link
              style={{ backgroundColor: "#666666", color: "#FFFFFF" }}
              onClick={handleLogout}
              className="btn pull-right">
              Log Out
            </Link>
          </Nav>
        </Container>
      </Navbar>

      <Alert
        show={showFileUploadSuccess}
        variant="success"
        className="d-flex align-items-center justify-content-between flex-row">
        {message}
        <Button
          onClick={() => setShowFileUploadSuccess(false)}
          variant="outline-success">
          Close
        </Button>
      </Alert>
      <Alert
        show={showFileUploadError}
        variant="danger"
        className="d-flex align-items-center justify-content-between flex-row">
        {fileUploadError}
        <Button
          onClick={() => setShowFileUploadError(false)}
          variant="outline-danger">
          Close
        </Button>
      </Alert>
      {loading ? (
        <div
          style={{
            height: "93vh",
            width: "100%",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            flexDirection: "column",
          }}>
          <PuffLoader color={"#8B0000"} loading={loading} size={150} />
          <h5 className="mt-4">
            Files are being uploaded - this process may take a while
          </h5>
          <h5>Please do not close tab or browser</h5>
        </div>
      ) : (
        <Container fluid>
          <Row style={{ height: "25vh" }} className="mb-4">
            <Col
              xs={3}
              className="d-flex align-items-start justify-content-center mt-2">
              <Card
                style={{
                  minHeight: "90%",
                  borderRadius: "20px",
                  backgroundColor: "#810B0A",
                  borderColor: "lightgray",
                }}
                className="w-75 m-2">
                <Container
                  style={{ color: "#FFF" }}
                  className="mt-3 text-center border-bottom">
                  <h4>CREATE NEW JOB</h4>
                </Container>
                <Card.Body
                  style={{
                    backgroundColor: "white",
                    borderBottomLeftRadius: "18px",
                    borderBottomRightRadius: "18px",
                  }}
                  className="d-flex align-items-center justify-content-center">
                  <Button
                    className="w-50"
                    variant="outline-dark"
                    type="submit"
                    disabled>
                    CREATE
                  </Button>
                </Card.Body>
              </Card>
            </Col>
            <Col xs={6} className="align-middle mt-2">
              <Card
                style={{
                  minHeight: "90%",
                  borderRadius: "20px",
                  backgroundColor: "#810B0A",
                  borderColor: "lightgray",
                }}
                className="m-2">
                <Container
                  style={{ color: "#FFF" }}
                  className="mt-3 text-center border-bottom">
                  <h4>SELECT JOB</h4>
                </Container>
                <Card.Body
                  style={{
                    backgroundColor: "white",
                    borderBottomLeftRadius: "18px",
                    borderBottomRightRadius: "18px",
                  }}>
                  <Form
                    className="d-flex align-items-center justify-content-center flex-row"
                    onSubmit={handleSelectJobSubmit}>
                    <Container style={{ width: "200%" }}>
                      <Form.Group id="job-number">
                        <Form.Label className="mb-0">JOB NUMBER</Form.Label>
                        <Typeahead
                          id="typeAheadID"
                          onChange={setSelected}
                          options={options}
                          placeholder="Enter Job"
                          onInputChange={handleInputChange}
                          selected={selected}
                          required
                        />
                        <Form.Control
                          type="text"
                          placeholder="Enter Job #"
                          ref={jobNumberRef}
                          style={{ display: "none" }}></Form.Control>
                      </Form.Group>
                      <Button
                        className="w-100 mt-3 mb-2"
                        variant="outline-dark"
                        type="submit">
                        SELECT
                      </Button>
                    </Container>
                    <Container className="text-center">
                      <div>CURRENT JOB</div>{" "}
                      {queriedJobFolder === null ||
                      queriedJobFolder.length === 0
                        ? "No Job Selected"
                        : queriedJobFolder[0].name}
                    </Container>
                  </Form>
                </Card.Body>
                {error && <Alert variant="danger">{error}</Alert>}
              </Card>
            </Col>
            <Col className="d-flex align-items-center flex-column justify-content-evenly">
              <input
                type="file"
                onChange={onChangeIssued}
                ref={saveIssuedDocInput}
                style={{ display: "none" }}
                accept=".pdf"
                multiple
              />
              <Button
                className="w-50"
                variant="outline-dark"
                onClick={() => {
                  onButtonClickIssued();
                }}>
                ISSUE SY DOCUMENT/S
              </Button>

              <input
                type="file"
                onChange={onChangeXlsx}
                ref={readXlsxFile}
                style={{ display: "none" }}
                accept=".xlsx, .xls, .csv"
              />
              <Button
                className="w-50"
                variant="outline-dark"
                onClick={() => {
                  onButtonClickXlsx();
                }}>
                CLEAN CURRENT PDF
              </Button>
            </Col>
          </Row>
          <Row style={{ height: "34vh" }}>
            <Col>
              <Container className="text-center" style={{ height: "10%" }}>
                <h5>SAVE RECEIVED DOCUMENTS</h5>
              </Container>
              <Container
                className="d-flex align-items-center flex-column justify-content-evenly"
                style={{ height: "80% " }}>
                <input
                  type="file"
                  onChange={onChangeReceived}
                  ref={saveReceivedDocInput}
                  style={{ display: "none" }}
                  multiple
                />

                <Button
                  className="w-100"
                  variant="outline-dark"
                  onClick={() => {
                    setReceivedSubFolder("CAD");
                    onButtonClickReceived();
                  }}>
                  CAD
                </Button>
                <Button
                  className="w-100"
                  variant="outline-dark"
                  onClick={() => {
                    setReceivedSubFolder("Photos");
                    onButtonClickReceived();
                  }}>
                  PHOTOS
                </Button>
                <Button
                  className="w-100"
                  variant="outline-dark"
                  onClick={() => {
                    setReceivedSubFolder("Shop Drawings");
                    onButtonClickReceived();
                  }}>
                  SHOP DRAWINGS
                </Button>
                <Button
                  className="w-100"
                  variant="outline-dark"
                  onClick={() => {
                    setReceivedSubFolder("Geotechnical");
                    onButtonClickReceived();
                  }}>
                  GEOTECHNICAL
                </Button>
              </Container>
            </Col>
            <Col>
              <Container className="text-center" style={{ height: "10%" }}>
                <h5>ADMIN DOCUMENTS</h5>
              </Container>
              <Container
                className="d-flex align-items-center flex-column justify-content-evenly"
                style={{ height: "80% " }}>
                <Button
                  className="w-100"
                  variant="outline-dark"
                  type="submit"
                  disabled>
                  FEE PROPOSAL
                </Button>
                <Button
                  className="w-100"
                  variant="outline-dark"
                  type="submit"
                  disabled>
                  FEE VARIATION
                </Button>
                <Button
                  className="w-100"
                  variant="outline-dark"
                  type="submit"
                  disabled>
                  LETTER
                </Button>
                <Button
                  className="w-100"
                  variant="outline-dark"
                  type="submit"
                  disabled>
                  REPORT
                </Button>
              </Container>
            </Col>
            <Col>
              <Container className="text-center" style={{ height: "10%" }}>
                <h5>CONCEPT</h5>
              </Container>
              <Container
                className="d-flex align-items-center flex-column justify-content-evenly"
                style={{ height: "80% " }}>
                <Button
                  className="w-100"
                  variant="outline-dark"
                  type="submit"
                  disabled>
                  DESIGN BRIEF
                </Button>
                <Button
                  className="w-100"
                  variant="outline-dark"
                  type="submit"
                  disabled>
                  GEOTECH FEE REQUEST
                </Button>
                <Button
                  className="w-100"
                  variant="outline-dark"
                  type="submit"
                  disabled>
                  CONCEPT DESIGN CHECKLIST
                </Button>
              </Container>
            </Col>
            <Col>
              <Container className="text-center" style={{ height: "10%" }}>
                <h5>DESIGN & DOCUMENTATION</h5>
              </Container>
              <Container
                className="d-flex align-items-center flex-column justify-content-evenly"
                style={{ height: "80% " }}>
                <Button
                  className="w-100"
                  variant="outline-dark"
                  type="submit"
                  disabled>
                  SAFETY IN DESIGN REPORT
                </Button>
                <Button
                  className="w-100"
                  variant="outline-dark"
                  type="submit"
                  disabled>
                  STRUCTURAL SPECIFICATIONS
                </Button>
                <Button
                  className="w-100"
                  variant="outline-dark"
                  type="submit"
                  disabled>
                  CALCULATION DOCUMENT
                </Button>
              </Container>
            </Col>
          </Row>
          <Row style={{ height: "34vh" }}>
            <Col>
              <Container className="text-center" style={{ height: "10%" }}>
                <h5>CONSTRUCTION</h5>
              </Container>
              <Container
                className="d-flex align-items-center flex-column justify-content-evenly"
                style={{ height: "80% " }}>
                <Button
                  className="w-100"
                  variant="outline-dark"
                  type="submit"
                  disabled>
                  SITE INSPECTION REPORT
                </Button>
                <Button
                  className="w-100"
                  variant="outline-dark"
                  type="submit"
                  disabled>
                  LETTER OF COMPLIANCE
                </Button>
                <Button
                  className="w-100"
                  variant="outline-dark"
                  type="submit"
                  disabled>
                  SHOP DRAWING REVIEW
                </Button>
                <Button
                  className="w-100"
                  variant="outline-dark"
                  type="submit"
                  disabled>
                  CERTIFICATION LETTER
                </Button>
              </Container>
            </Col>
            <Col>
              <Container className="text-center" style={{ height: "10%" }}>
                <h5>QA</h5>
              </Container>
              <Container
                className="d-flex align-items-center flex-column justify-content-evenly"
                style={{ height: "80% " }}>
                <Button
                  className="w-100"
                  variant="outline-dark"
                  type="submit"
                  disabled>
                  VERIFY ENGINEERING CHECKLIST
                </Button>
                <Button
                  className="w-100"
                  variant="outline-dark"
                  type="submit"
                  disabled>
                  VERIFY BIM CHECKLIST
                </Button>
                <Button
                  className="w-100"
                  variant="outline-dark"
                  type="submit"
                  disabled>
                  VERIFY DRAWING REVIEW
                </Button>
                <Button
                  className="w-100"
                  variant="outline-dark"
                  type="submit"
                  disabled>
                  VERIFY SAFETY IN DESIGN
                </Button>
              </Container>
            </Col>
            <Col></Col>
            <Col></Col>
          </Row>
          {/* <div className="w100" style={{ maxWidth: "400px" }}>
          <Card>
            <Card.Body>
              <h2 className="text-center mb-4">Profile</h2>
              {error && <Alert variant="danger">{error}</Alert>}
              <strong>Email:</strong> {currentUser.email}
              <Link to="/update-profile" className="btn btn-primary w-100 mt-3">
                Update Profile
              </Link>
            </Card.Body>
          </Card>
          <div className="w-100 text-center mt-2">
            <Button variant="link" onClick={handleLogout}>
              Log Out
            </Button>
          </div>
        </div> */}
        </Container>
      )}
    </>
  );
}
