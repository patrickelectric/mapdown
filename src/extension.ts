import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

let currentPanel: vscode.WebviewPanel | undefined = undefined;

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand('mapdown.mapdown', () => {
            if (currentPanel) {
                currentPanel.reveal(vscode.ViewColumn.Two);
            } else {
                currentPanel = vscode.window.createWebviewPanel(
                    'markdownGraph',
                    'Markdown Graph',
                    vscode.ViewColumn.Two,
                    {
                        enableScripts: true,
                        localResourceRoots: [vscode.Uri.file(context.extensionPath)]
                    }
                );

                currentPanel.webview.html = getWebviewContent(context, vscode.workspace.workspaceFolders![0].uri.fsPath);

                currentPanel.webview.onDidReceiveMessage(
                    message => {
                        const fileUri = vscode.Uri.file(message.filePath);
                        vscode.workspace.openTextDocument(fileUri).then(doc => {
                            vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
                        });
                    },
                    undefined,
                    context.subscriptions
                );

                currentPanel.onDidDispose(
                    () => {
                        currentPanel = undefined;
                    },
                    null,
                    context.subscriptions
                );

                const watcher = vscode.workspace.createFileSystemWatcher('**/*');
                watcher.onDidChange(uri => updateWebviewContent(context, vscode.workspace.workspaceFolders![0].uri.fsPath));
                watcher.onDidCreate(uri => updateWebviewContent(context, vscode.workspace.workspaceFolders![0].uri.fsPath));
                watcher.onDidDelete(uri => updateWebviewContent(context, vscode.workspace.workspaceFolders![0].uri.fsPath));

                context.subscriptions.push(watcher);
            }
        })
    );
}

function updateWebviewContent(context: vscode.ExtensionContext, workspacePath: string) {
    if (currentPanel) {
        currentPanel.webview.html = getWebviewContent(context, workspacePath);
    }
}

function getWebsiteName(urlString: string): string {
	try {
	  const parsedUrl = new URL(urlString);
	  // Using path.basename to demonstrate the use of the path module, although it's not really necessary here
	  const hostname = path.basename(parsedUrl.hostname);
	  return hostname;
	} catch (error) {
	  console.error('Invalid URL', error);
	  return '';
	}
  }

function getWebviewContent(context: vscode.ExtensionContext, workspacePath: string): string {
    const files = getAllMarkdownFiles(workspacePath);
    const { nodes, edges } = getMarkdownLinks(files);
	console.log(nodes, edges)

    const nodesJson = JSON.stringify(nodes);
    const edgesJson = JSON.stringify(edges);

    //const scriptPath = vscode.Uri.file(path.join(context.extensionPath, 'media', 'vis-network.min.js')).with({ scheme: 'vscode-resource' });
	const scriptPath = 'https://unpkg.com/vis-network/standalone/umd/vis-network.min.js';

    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Markdown Graph</title>
            <script type="text/javascript" src="${scriptPath}"></script>
            <style>
                body {
                    margin: 0;
                    padding: 0;
                    width: 100vw;
                    height: 100vh;
                    background-color: black;
                    color: white;
                }
                #mynetwork {
                    width: 100%;
                    height: 100%;
                    border: 1px solid lightgray;
                }
            </style>
        </head>
        <body>
            <div id="mynetwork"></div>
            <script>
                const vscode = acquireVsCodeApi();
                const nodes = new vis.DataSet(${nodesJson});
                const edges = new vis.DataSet(${edgesJson});
                const container = document.getElementById('mynetwork');
                const data = { nodes: nodes, edges: edges };
                const options = {
                    nodes: {
                        shape: "dot",
                        size: 16,
                        color: {
                            background: 'black',
                            border: 'white',
                            highlight: { border: 'white', background: 'grey' }
                        },
                        font: {
                            color: 'white'
                        }
                    },
                    edges: {
                        color: 'white',
                        arrows: {
                            to: { enabled: true, scaleFactor: 1 }
                        }
                    },
                    layout: {
                        randomSeed: 1,
						improvedLayout: true
                    },
                    physics: {
                        forceAtlas2Based: {
                            gravitationalConstant: -26,
                            centralGravity: 0.005,
                            springLength: 230,
                            springConstant: 0.18,
                        },
                        maxVelocity: 146,
                        solver: "forceAtlas2Based",
                        timestep: 0.35,
                        stabilization: { iterations: 150 },
                    },
                    interaction: {
                        hover: true
                    }
                };
                const network = new vis.Network(container, data, options);
                
                network.on('click', function(params) {
                    if (params.nodes.length > 0) {
                        const node = nodes.get(params.nodes[0]);
                        if (node.filePath) {
                            vscode.postMessage({ filePath: node.filePath });
                        }
                    }
                });

                network.storePositions();

                network.on("stabilizationIterationsDone", function () {
                    network.storePositions();
                });
            </script>
        </body>
        </html>
    `;
}

function getAllMarkdownFiles(dir: string, fileList: string[] = []): string[] {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const filePath = path.join(dir, file);
        if (fs.statSync(filePath).isDirectory()) {
            getAllMarkdownFiles(filePath, fileList);
        } else if (file.endsWith('.md')) {
            fileList.push(filePath);
        }
    }
    return fileList;
}

function getMarkdownLinks(files: string[]): { nodes: any[], edges: any[] } {
    const nodesMap: Record<string, any> = {};
    const edges = [];
    let nodeId = 0;

    function getNodeId(l: string, filePath?: string, color: string = "gray") {
		const label = l.toLowerCase();
		console.log(label)
        if (!nodesMap[label] || !nodesMap[label].filePath) {
			if (nodesMap[label]) {
				nodesMap[label] = { id: nodesMap[label].id, label, filePath, color: nodesMap[label].color };
			} else {
            	nodesMap[label] = { id: nodeId++, label, filePath, color};
			}
        }
        return nodesMap[label].id;
    }

	function getNodeColor(l: string) {
		const label = l.toLowerCase();
        return nodesMap[label].color;
    }

    for (const file of files) {
        const fileNodeId = getNodeId(path.parse(file).name, file, "green");
    }

	for (const file of files) {
        const content = fs.readFileSync(file, 'utf-8');
        const linkRegex = /\[.*?\]\((.*?)\)|\[\[(.*?)\]\]/g;
        const matches = content.matchAll(linkRegex);
		const fileNodeId = getNodeId(path.parse(file).name, file, "green");

        for (const match of matches) {
            const link = match[1] || match[2];
            if (link) {
                const linkPath = link.endsWith('.md') ?
					path.resolve(path.dirname(file), link) :
					link.startsWith('http') ?
					(new URL(link)).hostname : link
				let linkNodeId = undefined
				let color = undefined
				if (link.startsWith('http')) {
					linkNodeId = getNodeId(linkPath, linkPath, "yellow");
					color = 'yellow'
				} else {
                	linkNodeId = getNodeId(path.parse(linkPath).name, linkPath);
					color = getNodeColor(path.parse(linkPath).name)
				}
				for (const edge of edges) {
					if (edge.from === fileNodeId && edge.to === linkNodeId) {
						continue
					}
				}
				if (color === "gray") {
                	edges.push({ from: fileNodeId, to: linkNodeId, arrows: 'to', color: { color },  dashes: true});
				} else {
					edges.push({ from: fileNodeId, to: linkNodeId, arrows: 'to', color: { color }});
				}
            }
        }
    }

    return { nodes: Object.values(nodesMap), edges };
}

export function deactivate() {}
