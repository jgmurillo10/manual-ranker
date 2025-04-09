import React, { useState } from "react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import "./App.css";

function App() {
  const [images, setImages] = useState([]);
  const [folderHandle, setFolderHandle] = useState(null);
  const [comparisonMode, setComparisonMode] = useState(false);
  const [currentPair, setCurrentPair] = useState(null);
  const [criterion, setCriterion] = useState("overall");
  const [roundPairs, setRoundPairs] = useState([]);
  const [winners, setWinners] = useState([]);
  const [comparisonHistory, setComparisonHistory] = useState([]);
  const [eliminated, setEliminated] = useState([]);

  // Add a function to create a new object URL from a file
  const createImageUrl = async (file) => {
    const url = URL.createObjectURL(file);
    return url;
  };

  const getImagesFromFolder = async (dirHandle, path = "") => {
    const images = [];
    for await (const entry of dirHandle.values()) {
      if (entry.kind === "file") {
        if (entry.name.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
          const file = await entry.getFile();
          // Store the file reference along with the URL
          images.push({
            id: `image-${path}${entry.name}`,
            file: file,
            path: await createImageUrl(file),
            name: `${path}${entry.name}`,
          });
        }
      } else if (entry.kind === "directory") {
        const subImages = await getImagesFromFolder(
          entry,
          `${path}${entry.name}/`
        );
        images.push(...subImages);
      }
    }
    return images;
  };

  const handleFolderSelect = async () => {
    try {
      const handle = await window.showDirectoryPicker();
      setFolderHandle(handle);

      // Clear previous object URLs
      images.forEach((img) => {
        if (img.path) {
          URL.revokeObjectURL(img.path);
        }
      });

      setEliminated([]);
      setComparisonHistory([]);
      const imageFiles = await getImagesFromFolder(handle);
      setImages(imageFiles);
    } catch (error) {
      console.error("Error accessing folder:", error);
    }
  };

  const handleDragEnd = (result) => {
    if (!result.destination) return;

    const items = Array.from(images);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    setImages(items);
  };

  const downloadSortedList = () => {
    // Create the new format with sorted lists by criterion and comparison history
    const output = {
      [`sorted_${criterion}`]: images.map((img) => img.name),
      pairs: comparisonHistory,
    };

    const jsonContent = JSON.stringify(output, null, 2);
    const blob = new Blob([jsonContent], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "sorted-images.json";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const moveToLast = (index) => {
    const items = Array.from(images);
    const [movedItem] = items.splice(index, 1);
    items.push(movedItem);
    setImages(items);
  };

  const createPairs = (items) => {
    const pairs = [];
    for (let i = 0; i < items.length; i += 2) {
      if (i + 1 < items.length) {
        pairs.push({
          left: items[i],
          right: items[i + 1],
          leftIndex: i,
          rightIndex: i + 1,
        });
      } else {
        // If odd number of items, last one automatically advances
        winners.push(items[i]);
      }
    }
    return pairs;
  };

  const startComparison = async () => {
    if (images.length < 2) return;

    setComparisonMode(true);
    setWinners([]);
    setEliminated([]);
    if (
      comparisonHistory.length > 0 &&
      comparisonHistory[0].criterion !== criterion
    ) {
      setComparisonHistory([]);
    }

    const pairs = createPairs(images);
    setRoundPairs(pairs);

    // Setup first pair
    const firstPair = pairs[0];
    const leftFile = firstPair.left.file;
    const rightFile = firstPair.right.file;

    setCurrentPair({
      left: {
        ...firstPair.left,
        path: await createImageUrl(leftFile),
      },
      right: {
        ...firstPair.right,
        path: await createImageUrl(rightFile),
      },
      leftIndex: firstPair.leftIndex,
      rightIndex: firstPair.rightIndex,
      pairIndex: 0,
    });
  };

  const handleComparisonChoice = async (
    decision,
    winner = null,
    loser = null
  ) => {
    // Add comparison to history with the new decision types
    setComparisonHistory((prev) => [
      ...prev,
      {
        image_a: currentPair.left.name,
        image_b: currentPair.right.name,
        decision:
          decision === "left"
            ? "image_a"
            : decision === "right"
            ? "image_b"
            : decision, // keep "both", "none", "skip" as is
        criterion,
      },
    ]);

    // Handle different decision types
    switch (decision) {
      case "left":
      case "right":
        setWinners((prev) => [...prev, winner]);
        setEliminated((prev) => [...prev, loser]);
        break;
      case "both":
        setWinners((prev) => [...prev, currentPair.left, currentPair.right]);
        break;
      case "none":
        setEliminated((prev) => [...prev, currentPair.left, currentPair.right]);
        break;
      case "skip":
        setWinners((prev) => [...prev, currentPair.left, currentPair.right]);
        break;
      default:
        break;
    }

    // Clean up current pair's URLs
    if (currentPair) {
      URL.revokeObjectURL(currentPair.left.path);
      URL.revokeObjectURL(currentPair.right.path);
    }

    // Move to next pair in current round
    const nextPairIndex = currentPair.pairIndex + 1;

    if (nextPairIndex < roundPairs.length) {
      // More pairs in this round
      const nextPair = roundPairs[nextPairIndex];
      const leftFile = nextPair.left.file;
      const rightFile = nextPair.right.file;

      setCurrentPair({
        left: {
          ...nextPair.left,
          path: await createImageUrl(leftFile),
        },
        right: {
          ...nextPair.right,
          path: await createImageUrl(rightFile),
        },
        leftIndex: nextPair.leftIndex,
        rightIndex: nextPair.rightIndex,
        pairIndex: nextPairIndex,
      });
    } else {
      // Round complete
      if (winners.length > 1) {
        // Start next round with winners
        const nextRoundPairs = createPairs(winners);
        setRoundPairs(nextRoundPairs);
        setWinners([]);

        // Setup first pair of next round
        const firstPair = nextRoundPairs[0];
        const leftFile = firstPair.left.file;
        const rightFile = firstPair.right.file;

        setCurrentPair({
          left: {
            ...firstPair.left,
            path: await createImageUrl(leftFile),
          },
          right: {
            ...firstPair.right,
            path: await createImageUrl(rightFile),
          },
          leftIndex: firstPair.leftIndex,
          rightIndex: firstPair.rightIndex,
          pairIndex: 0,
        });
      } else {
        // Tournament complete
        // Create fresh URLs for all images in the final ranking
        const finalRanking = [...winners];
        const remainingImages = images.filter(
          (img) => !winners.some((w) => w.id === img.id)
        );

        // Put eliminated images at the end
        const sortedRemaining = remainingImages.sort((a, b) => {
          const aEliminated = eliminated.some((e) => e.id === a.id);
          const bEliminated = eliminated.some((e) => e.id === b.id);
          if (aEliminated && !bEliminated) return 1;
          if (!aEliminated && bEliminated) return -1;
          return 0;
        });

        // Create new URLs for all images
        const updatedRanking = await Promise.all(
          [...finalRanking, ...sortedRemaining].map(async (img) => ({
            ...img,
            path: await createImageUrl(img.file),
          }))
        );

        setImages(updatedRanking);
        setComparisonMode(false);
        setCurrentPair(null);
        setRoundPairs([]);
        setWinners([]);
        setEliminated([]);
      }
    }
  };

  // Cleanup object URLs when component unmounts
  React.useEffect(() => {
    return () => {
      images.forEach((img) => {
        if (img.path) {
          URL.revokeObjectURL(img.path);
        }
      });
      if (currentPair) {
        URL.revokeObjectURL(currentPair.left.path);
        URL.revokeObjectURL(currentPair.right.path);
      }
    };
  }, [images, currentPair]);

  return (
    <div className="App">
      <h1>Image Sorter</h1>
      <div className="controls">
        <button onClick={handleFolderSelect} className="folder-button">
          {folderHandle ? "Change Folder" : "Select Folder"}
        </button>
        {images.length > 0 && (
          <>
            <button onClick={downloadSortedList} className="download-button">
              Download Sorted List
            </button>
            {!comparisonMode && (
              <>
                <select
                  value={criterion}
                  onChange={(e) => setCriterion(e.target.value)}
                  className="criterion-select"
                >
                  <option value="overall">Overall Quality</option>
                  <option value="correctness">Correctness</option>
                  <option value="template">Template Match</option>
                  <option value="clarity">Clarity</option>
                  <option value="counting">Counting Accuracy</option>
                  <option value="portion_size">Portion Size Accuracy</option>
                </select>
                <button onClick={startComparison} className="compare-button">
                  Start Comparison Mode
                </button>
              </>
            )}
          </>
        )}
      </div>
      {folderHandle && (
        <p className="folder-name">Selected folder: {folderHandle.name}</p>
      )}
      {comparisonMode && currentPair ? (
        <div className="comparison-container">
          <h2>Compare by: {criterion}</h2>
          <p className="round-info">
            Pair {currentPair.pairIndex + 1} of {roundPairs.length}
            {winners.length > 0 && ` (${winners.length} winners so far)`}
          </p>
          <div className="comparison-pair">
            <div className="comparison-item">
              <img
                src={currentPair.left.path}
                alt={currentPair.left.name}
                className="comparison-image"
              />
              <button
                onClick={() =>
                  handleComparisonChoice(
                    "left",
                    currentPair.left,
                    currentPair.right
                  )
                }
                className="choose-button"
              >
                Choose Left
              </button>
            </div>
            <div className="comparison-item">
              <img
                src={currentPair.right.path}
                alt={currentPair.right.name}
                className="comparison-image"
              />
              <button
                onClick={() =>
                  handleComparisonChoice(
                    "right",
                    currentPair.right,
                    currentPair.left
                  )
                }
                className="choose-button"
              >
                Choose Right
              </button>
            </div>
          </div>
          <div className="additional-options">
            <button
              onClick={() => handleComparisonChoice("both")}
              className="option-button both-button"
            >
              Select Both
            </button>
            <button
              onClick={() => handleComparisonChoice("none")}
              className="option-button none-button"
            >
              Select None
            </button>
            <button
              onClick={() => handleComparisonChoice("skip")}
              className="option-button skip-button"
            >
              Skip
            </button>
          </div>
          <button
            onClick={() => {
              setComparisonMode(false);
              setCurrentPair(null);
              setRoundPairs([]);
              setWinners([]);
            }}
            className="cancel-button"
          >
            Exit Comparison Mode
          </button>
        </div>
      ) : (
        <div className="drag-drop-context">
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="images" direction="vertical">
              {(provided) => (
                <div
                  {...provided.droppableProps}
                  ref={provided.innerRef}
                  className="image-grid"
                >
                  {images.map((image, index) => (
                    <Draggable
                      key={image.id}
                      draggableId={image.id}
                      index={index}
                    >
                      {(provided) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          {...provided.dragHandleProps}
                          className="image-container"
                        >
                          <img
                            src={image.path}
                            alt={image.name}
                            className="image"
                          />
                          <div className="image-index">{index + 1}</div>
                          <div className="image-name">{image.name}</div>
                          <button
                            className="move-to-last-button"
                            onClick={(e) => {
                              e.stopPropagation(); // Prevent drag start
                              moveToLast(index);
                            }}
                          >
                            Move to Last
                          </button>
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        </div>
      )}
    </div>
  );
}

export default App;
