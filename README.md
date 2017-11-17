# Setup an local, on premises environment to run lambda like microservice functions on a kubernetes cluster

> This repository houses a few example applications to run on a kubernetes cluster in the traditional containerized method and functions to run as microservices in a kubernetes "serverless" environment.  This README file walks a user through the steps of setting up the Kubernetes cluster and deploying the applications.

## Prefatory Matters
This tutorial was done on MacOS High Sierra using Vagrant for machine virtualization.  Most of the important aspects are accomplished inside the Vagrant VMs running CentOS 7, so there reason this couldn't work on Windows or Linux.

## What You'll Accomplish
1. Using Vagrant, you'll setup three CentOS7 virtual machines that will act as a master and two minions of a virtual Kubernetes (K8) cluster running on a single machine.  
2. Using those VMs, manually create and configure a Kubernetes cluster.  Install an ingress controller to control access to the services running on the cluster.
3. Install a serverless framework to transform your Kubernetes cluster into an AWS Lambda-like serverless platform.
4. Deploy Node.js and Python applications to the cluster running as traditional containerized applications and lambda functions.

## Goal
When complete, you'll be able to create a serverless envrionment capable of running lambda functions without the overhead of managing the containerization of those functions.

## Walkthrough
1. [Environment and VM Setup](#environment-and-vm-setup)
2. [Kubernetes Installation and Configuration](#Kubernetes-Installation-and-Configuration)
3. [Setup Host Machine to Control Cluster](#)
4. [Containerized Application Deployment](#)
5. [Fission Installation and Configuration](#)
6. [Kanali Installation and Configuration](#)
7. [Serverless Function Deployment](#)

# Environment and VM Setup
###### Install Brew
```
/usr/bin/ruby -e "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/master/install)"
```

###### Install Vagrant and Dependencies
```
brew cask install virtualbox
brew cask install vagrant
brew cask install vagrant-manager
brew cask install wget
```

###### Clone this Repository
```
cd ~/Documents
mkdir serverless-on-kubernetes && cd serverless-on-kubernetes
git clone https://github.com/Ulls/serverless-on-kubernetes.git
```
(If you need to install git, instructions are [here](https://www.atlassian.com/git/tutorials/install-git#mac-os-x).)

###### Configure the CentOS VMs
```
cd ~/Documents/serverless-on-kubernetes
mkdir master && cd master
vagrant init centos/7
```

Edit the Vagrantfile to allow insecure mode for downloading the box (cert issue at the host) and for the creation of a private IP address for the VM.  The Vagrantfile should look like this:
```
Vagrant.configure("2") do |config|
  config.vm.box = "centos/7"
  config.vm.box_download_insecure = true
  config.vm.network "private_network", type: "dhcp"
end
```

###### Create the VM by running Vagrant's 'up' command
```
vagrant up
```
There is a chance you might run into the dreaded Vagrant error "".  If that's the case add a random IP address to your config.vm.network line: `config.vm.network "private_network", type: "dhcp", ip: "10.0.0.8"`

Repeat these configuration steps starting at "Configure the CentOS VMs" to create the minions.  Simply replace "master" with "minion1" and then repeat again with "minion2".

###### SSH into your VMs and edit the host files so they can communicate.
```
cd ~/Documents/local/vagrant/centos7-01
vagrant ssh
sudo su
ip address show
```

Copy the IP address on the eth1.  Do this for both VMs.  Edit the three /etc/hosts files, the 2 VMs and the host machine so that you can reference these machines by name.
`vi /etc/hosts` and add...
```
<IP of master>    master
<IP of minion1>   minion1
<IP of minion2>   minion2
```

# Kubernetes Installation and Configuration
###### Install helper software and disable selinux
The following steps will apply to both the master and two minions.  It will be noted where there are differences.  In a Kubernetes cluster, the master and the minions require different software installed and configured.  This walkthrough will differentiate those for you.

Let's start with the master.  Access your VMs by issuing the following commands.

```
cd ~/Documents/serverless-on-kubernetes/master
vagrant ssh
```
At this point you're now inside your VM where you'll install helper software packages and disable selinux.
```
sudo su
yum install -y wget
yum install -y ntp
yum install -y etcd
```
ntp and etcd are essential to Kubernetes.  We'll run those later on.
Time to disable selinux...
`vi /etc/sysconfig/selinux`... edit this file like so:
~~~~~
#SELINUX=enabled
SELINUX=disabled
~~~~~
*If you're not familiar with the vi editor, use an editor of you choice otherwise here are a few commands you should know...*
> i: Input mode (allows you to add text)
> esc: Leaves input mode
> shift-ZZ: Saves the file and exits (when not in input mode)

Now reboot to assure selinux is off...
```
reboot
```
You're not back outside your VM.  It'll come back up in about a minute.  When it does, ssh back into the box and check the status of selinux.
```
vagrant ssh
sudo su
sestatus
```
If sestatus reports "disabled", move on.

###### Install and configure Kubernetes

The following steps are done inside of you VMs, so `cd` to each directory and repeat these steps for each, keeping in mind the differences between the master and the minions.  Again, `vagrant ssh` to access the VM's command line.  Then, perform the following steps...
```
mkdir /etc/kubernetes
cd /tmp
wget https://github.com/kubernetes/kubernetes/releases/download/v1.8.3/kubernetes.tar.gz
tar -zvxf kubernetes.tar.gz -C .
```
The binaries aren’t included, so they need to be downloaded and extracted…
```
cd /tmp/kubernetes/cluster
./get-kube-binaries.sh
cd ../server
tar -zvxf kubernetes-server-linux-amd64.tar.gz -C .
```
Set you cluster name…
```
# echo "export CLUSTER_NAME=sl" >> /etc/environment
# exit
# exit
$ vagrant ssh
# sudo su
# echo $CLUSTER_NAME
sl
```
Copy the binaries to the bin directory...
```
cd /tmp/kubernetes/server/kubernetes/server/bin &&
cp kube-apiserver /usr/bin &&
cp kube-controller-manager /usr/bin &&
cp kube-proxy /usr/bin &&
cp kube-scheduler /usr/bin &&
cp kubelet /usr/bin &&
mkdir /var/lib/kubelet
```
Start ntp...
`systemctl enable ntpd && systemctl start ntpd`

If you're on a minion, you're going to need to install docker...
`yum install -y docker`

When you run the binary files you copied to the /usr/bin directory a couple of steps ago, they're going to read in variables from the files you're about to create now.  The first command will be what file to create and edit (using vi) followed by the text to place in the file.  

**MASTER and MINIONS**
`vi /etc/kubernetes/config`
~~~~
KUBE_LOGTOSTDERR="--logtostderr=true"
KUBE_LOG_LEVEL="--v=0"
KUBE_ALLOW_PRIV="--allow-privileged=false"
KUBE_MASTER="--master=http://master:8080"
KUBE_ETCD_SERVERS="--etcd-servers=http://master:2379"
~~~~

**MASTER**
`vi /etc/kubernetes/kubelet`
~~~~
KUBELET_ADDRESS="--address=127.0.0.1"
KUBELET_HOSTNAME="--hostname-override=127.0.0.1"
KUBELET_API_SERVER="--api-servers=http://127.0.0.1:8080"
KUBELET_POD_INFRA_CONTAINER="--pod-infra-container-image=registry.access.redhat.com/rhel7/pod-infrastructure:latest"
KUBELET_ARGS=""
~~~~

**MINIONS**
`vi /etc/kubernetes/kubelet`
~~~~
KUBELET_ADDRESS="--address=0.0.0.0"
KUBELET_PORT="--port=10250"
KUBELET_HOSTNAME="--hostname-override=<MINION1 or MINION2>"
#KUBELET_API_SERVER="--api-servers=http://master:8080"
#KUBELET_POD_INFRA_CONTAINER="--pod-infra-container-image=registry.access.redhat.com/rhel7/pod-infrastructure:latest"
KUBELET_KUBECONFIG="--kubeconfig=/etc/kubernetes/kubeconfig --require-kubeconfig"
KUBELET_ARGS="--fail-swap-on=false --require-kubeconfig --cgroup-driver=systemd"
~~~~

**MINIONS**
`vi /etc/kubernetes/kubeconfig`
~~~~
apiVersion: v1
clusters:
- cluster:
   server: http://master:8080
 name: sl
contexts:
- context:
   cluster: sl
   user: sl
 name: sl
current-context: sl
kind: Config
preferences: {}
users:
- name: cluster-admin
 user:
   password: password
   username: admin
~~~~

**MASTER**
`vi /etc/kubernetes/apiserver`
~~~~
KUBE_ETCD_SERVERS="--etcd-servers=http://127.0.0.1:2379"
KUBE_SERVICE_ADDRESSES="--service-cluster-ip-range=10.254.0.0/16"
#KUBE_ADMISSION_CONTROL="--admission-control=NamespaceLifecycle,NamespaceExists,LimitRanger,SecurityContextDeny,ServiceAccount,ResourceQuota"
KUBE_API_ARGS=""
ETCD_LISTEN_CLIENT_URLS="http://0.0.0.0:2379"
ETCD_ADVERTISE_CLIENT_URLS="http://0.0.0.0:2379"
KUBE_API_ADDRESS="--address=0.0.0.0"
KUBE_API_PORT="--port=8080"
KUBELET_PORT="--kubelet-port=10250"
~~~~

**MASTER**
`vi /etc/kubernetes/controller-manager`
~~~~
KUBE_CONTROLLER_MANAGER_ARGS=""
~~~~

**MASTER**
`vi /etc/kubernetes/scheduler`
~~~~
KUBE_SCHEDULER_ARGS=""
~~~~

**MASTER and MINIONS**
`vi /etc/kubernetes/proxy`
~~~~
KUBE_PROXY_ARGS=""
~~~~

**MASTER**
`vi /etc/etcd/etcd.conf`
**ADD** these lines to the end of the file...
~~~~
ETCD_LISTEN_CLIENT_URLS="http://0.0.0.0:2379"
ETCD_ADVERTISE_CLIENT_URLS="http://0.0.0.0:2379"
~~~~

Create the service definitions for the kubernetes binaries that need to be run on the **MASTERS**...
`vi /usr/lib/systemd/system/kube-apiserver.service`
~~~~
[Unit]
Description=Kubernetes API Server
Documentation=https://github.com/GoogleCloudPlatform/kubernetes
After=network.target
After=etcd.service

[Service]
EnvironmentFile=-/etc/kubernetes/config
EnvironmentFile=-/etc/kubernetes/apiserver
User= root
ExecStart=/usr/bin/kube-apiserver \
           $KUBE_LOGTOSTDERR \
           $KUBE_LOG_LEVEL \
           $KUBE_ETCD_SERVERS \
           $KUBE_API_ADDRESS \
           $KUBE_API_PORT \
           $KUBELET_PORT \
           $KUBE_ALLOW_PRIV \
           $KUBE_SERVICE_ADDRESSES \
           $KUBE_ADMISSION_CONTROL \
           $KUBE_API_ARGS
Restart=on-failure
Type=notify
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
~~~~

`vi /usr/lib/systemd/system/kube-controller-manager.service`
~~~~
[Unit]
Description=Kubernetes Controller Manager
Documentation=https://github.com/GoogleCloudPlatform/kubernetes

[Service]
EnvironmentFile=-/etc/kubernetes/config
EnvironmentFile=-/etc/kubernetes/controller-manager
User= root
ExecStart=/usr/bin/kube-controller-manager \
           $KUBE_LOGTOSTDERR \
           $KUBE_LOG_LEVEL \
           $KUBE_MASTER \
           $KUBE_CONTROLLER_MANAGER_ARGS
Restart=on-failure
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
~~~~

`vi /usr/lib/systemd/system/kube-scheduler.service`
~~~~
[Unit]
Description=Kubernetes Scheduler Plugin
Documentation=https://github.com/GoogleCloudPlatform/kubernetes

[Service]
EnvironmentFile=-/etc/kubernetes/config
EnvironmentFile=-/etc/kubernetes/scheduler
User=root
ExecStart=/usr/bin/kube-scheduler \
           $KUBE_LOGTOSTDERR \
           $KUBE_LOG_LEVEL \
           $KUBE_MASTER \
           $KUBE_SCHEDULER_ARGS
Restart=on-failure
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
~~~~

Create the service definitions for the kubernetes binaries that need to be run on the **MINIONS**...
`vi /usr/lib/systemd/system/kubelet.service`
~~~~
[Unit]
Description=Kubernetes Kubelet Server
Documentation=https://github.com/GoogleCloudPlatform/kubernetes
After=docker.service
Requires=docker.service

[Service]
WorkingDirectory=/var/lib/kubelet
EnvironmentFile=-/etc/kubernetes/config
EnvironmentFile=-/etc/kubernetes/kubelet
User=root
ExecStart=/usr/bin/kubelet \
           $KUBE_LOGTOSTDERR \
           $KUBE_LOG_LEVEL \
           $KUBELET_KUBECONFIG \
           $KUBELET_ADDRESS \
           $KUBELET_PORT \
           $KUBELET_HOSTNAME \
           $KUBE_ALLOW_PRIV \
           $KUBELET_POD_INFRA_CONTAINER \
           $KUBELET_ARGS
Restart=on-failure

[Install]
WantedBy=multi-user.target
~~~~

`vi /usr/lib/systemd/system/kube-proxy.service`
~~~~
[Unit]
Description=Kubernetes Kube-Proxy Server
Documentation=https://github.com/GoogleCloudPlatform/kubernetes
After=network.target

[Service]
EnvironmentFile=-/etc/kubernetes/config
EnvironmentFile=-/etc/kubernetes/proxy
ExecStart=/usr/bin/kube-proxy \
           $KUBE_LOGTOSTDERR \
           $KUBE_LOG_LEVEL \
           $KUBE_MASTER \
           $KUBE_PROXY_ARGS
Restart=on-failure
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
~~~~

Start everything up…
**MASTER**
```
systemctl enable etcd kube-apiserver kube-controller-manager kube-scheduler
systemctl start etcd kube-apiserver kube-controller-manager kube-scheduler
```

**MINIONS**
```
systemctl enable kube-proxy kubelet docker
systemctl start kube-proxy kubelet docker
```

Check to make sure everything is running...
**MASTER**
`systemctl status etcd kube-apiserver kube-controller-manager kube-scheduler | grep "(running)" | wc -l`
> 4

**MINIONS**
`systemctl status kube-proxy kubelet docker  | grep "(running)" | wc -l`
> 3

**MINIONS**
Check to make sure docker can pull down images and run them...
```
docker images
docker --version
docker pull hello-world
docker run hello-world
```

Install and run kubectl from your host machine…

# cd /tmp
# curl -LO https://storage.googleapis.com/kubernetes-release/release/`curl -s https://storage.googleapis.com/kubernetes-release/release/stable.txt`/bin/darwin/amd64/kubectl
# chmod +x ./kubectl
# sudo mv ./kubectl /usr/local/bin/kubectl
# kubectl cluster-info

# vi .kube/config
apiVersion: v1
clusters:
- cluster:
    server: http://172.28.128.3:8080
  name: localvm
- cluster:
    server: http://172.28.128.6:8080
  name: sl
contexts:
- context:
    cluster: localvm
    user: localvm
  name: localvm
- context:
    cluster: sl
    user: sl
  name: sl
current-context: sl
kind: Config
preferences: {}
users:
- name: cluster-admin
  user:
    password: password
    username: admin

Test your deployment…
# cd ~/Documents/projects/serverless
# mkdir helloworld && cd helloworld
# vi server.js
var http = require('http');

var handleRequest = function(request, response) {
  console.log('Received request for URL: ' + request.url);
  response.writeHead(200);
  response.end('Hello World!');
};
var www = http.createServer(handleRequest);
www.listen(8080);

# node server.js
	goto http://localhost:8080/ to test
# <ctrl-c>
# vi Dockerfile
FROM node:6.9.2
EXPOSE 8080
COPY server.js .
CMD node server.js

# docker build -t helloworld:v1 .
# docker login
	enter username/password
# docker tag helloworld:v1 ulls/helloworld:v1
# docker push ulls/helloworld:v1


$ mkdir sl-test && cd sl-test
$ vi server.js
var http = require('http');

var handleRequest = function(request, response) {
  console.log('Received request for URL: ' + request.url);
  response.writeHead(200);
  response.end('Hello World!');
};

console.log('Starting Server on port 8080...');
var www = http.createServer(handleRequest).listen(8080, function(){
    console.log('OK. HTTP server started');
});

var sockets = {}, nextSocketId = 0;
www.on('connection', function (socket) {
    var socketId = nextSocketId++;
    sockets[socketId] = socket;
    console.log('socket', socketId, 'opened');

    socket.on('close', function () {
        console.log('socket', socketId, 'closed');
        delete sockets[socketId];
    });
});

var end = function(){
    www.close(function () {
        console.log('...app is shutting down');
        process.exit(0);
    });
    for (var socketId in sockets) {
        console.log('socket connection', socketId, 'destroyed');
        sockets[socketId].destroy();
    }
};
process.on('SIGTERM', function () {
    console.log('SIGTERM issued... ');
    end();
});

process.on('SIGINT', function() {
    console.log('SIGINT issued... ');
    end();
});

$ vi Dockerfile
FROM node:6.9.2
EXPOSE 8080
COPY server.js .
CMD node server.js

Create a local docker repo…
Create a local Docker registry to deploy your container to
$ docker run -d \
  -p 5000:5000 \
  --restart=always \
  --name registry \
  registry:2
Get the new image id
$ docker images | grep java-test
(<image id> = 12 random characters)
$ docker tag <image id> localhost:5000/java-test:0.1
$ docker push 127.0.0.1:5000/java-test:0.1
Check to see that your image has been pushed to the local registry
$ curl http://127.0.0.1:5000/v2/_catalog

In your Vagrant VM running a K8 minion, find the default gateway to talk to the host OS
# sudo yum install net-tools
# netstat -rn
Destination     Gateway         Genmask         Flags   MSS Window  irtt Iface
0.0.0.0         10.0.2.2        0.0.0.0         UG        0 0          0 eth0
Check to see you can access host OS local repository
# curl http://10.0.2.2:5000/v2/_catalog

In order for the minion to be able to pull the local image, you need to tell Docker to allow for insecure connections to repositories.
Create or modify /etc/docker/daemon.json
{ "insecure-registries":["docker.for.mac.localhost:5000","10.0.2.2:5000","local-docker-repo:5000"] }
Restart docker daemon
# sudo service docker restart
Add an entry to your minion’s /etc/hosts file...
# vi /etc/hosts
	10.0.2.2        local-docker-repo
# curl http://local-docker-repo:5000/v2/_catalog

Containerize your server.js app into a docker container…
$ docker build -t local-docker-repo:5000/sl-test .
$ docker tag local-docker-repo:5000/sl-test local-docker-repo:5000/sl-test:0.1
$ docker push local-docker-repo:5000/sl-test

$ docker tag sl-test:latest ulls/sl-test:0
$ docker push ulls/sl-test
$ kubectl run sl-test --image=docker pull ulls/sl-test:0 --port=8080


Create kubernetes deployment and service yml file…
## YAML Template.
---

kind: Service
apiVersion: v1
metadata:
  name: sl-test
spec:
  type: NodePort
  selector:
    app: sl-test
  ports:
  - name: http
    protocol: TCP
    port: 8088
    targetPort: 8080
    nodePort: 31008

---

apiVersion: extensions/v1beta1
kind: Deployment
metadata:
  name: sl-test
  labels:
    app: sl-test
    environment: local
spec:
  replicas: 1
  selector:
    matchLabels:
      app: sl-test
  template:
    metadata:
      labels:
        app: sl-test
    spec:
      containers:
      - name: sl-test
        image: local-docker-repo:5000/sl-test:latest
        imagePullPolicy: Always
        ports:
          - containerPort: 8080

Deploy the container to your new cluster…

Test your deployment by navigating to http://<IP of your MINION>:31008/


Switching kubectl between k8 clusters
$ vi ~/.kube/config
$ kubectl config use-context <context name>
